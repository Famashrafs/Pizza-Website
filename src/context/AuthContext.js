import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updateEmail,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '../firebase';
import getAuthErrorMessage from '../services/authErrors';
import db from '../services/db';
import { removeUserData } from '../services/storage';
import {
  ROLES,
  DEFAULT_ROLE,
  ADMIN_ROLES,
  normalizeRole,
  roleHasAdminAccess,
} from '../config/roles';
import {
  getOwnerRestaurants,
  onboardOwnerRestaurant,
  seedOwnerSetup,
} from '../services/restaurantService';
import { RESTAURANT_ID } from '../config/restaurant';
import { devLog, runtimeWarn } from '../utils/devLog';

const AuthContext = createContext();

// Upper bound for "wait until the auth listener published the profile". Keeps a
// stalled/failed data layer from blocking navigation indefinitely.
const PROFILE_WAIT_TIMEOUT_MS = 5000;

export function useAuth() {
  return useContext(AuthContext);
}

// Fallback profile used when an account has no `users/{uid}` document yet.
// Role ownership/restaurant identity only ever come from Firestore.
function defaultCustomerProfile(user) {
  return {
    uid: user.uid,
    role: DEFAULT_ROLE,
    name: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    phone: '',
    phoneVerified: false,
    restaurantId: null,
    restaurantIds: {},
    ...(user.metadata?.creationTime
      ? { createdAt: new Date(user.metadata.creationTime).toISOString() }
      : {}),
  };
}

// Identity fields are enforced by `firestore.rules` on the server — they are
// stripped client-side so they never leak into a routine profile update.
function stripIdentityFields(data) {
  const { role: _role, restaurantId: _restaurantId, restaurantIds: _restaurantIds, ...fields } =
    data || {};
  return fields;
}

// Legacy-owner recovery (migration from before `users/{uid}` documents existed,
// or from partial profile writes).
//
// Owner status is ONLY restored from a Firestore `restaurants` document that
// explicitly lists `ownerId == currentUser.uid`. That document relationship is
// the authority — never localStorage, email address, URL, or a client role.
//
// Rule-safe write sequence:
//   1. create the profile WITHOUT a restaurant identity (the create rule
//      forbids claiming ownership on create), then
//   2. attach the identity through the ownership-grant update, which the rules
//      re-verify against the restaurant's `ownerId`.
//
// Recovery never silently converts a Firestore owner into a customer, never
// promotes a customer into an owner (rules forbid client role changes, so a
// mismatch is logged for manual review instead), and never overwrites an
// existing owner/admin identity.

function hasRestaurantIdentity(profile) {
  const ids = (profile && profile.restaurantIds) || {};
  return !!(profile && profile.restaurantId && Object.keys(ids).length > 0);
}

// A failed read and a missing document are different facts and must never be
// collapsed into one: a read that throws (database unreachable, rules denying the
// document) used to be treated as "no profile", which silently downgraded an
// owner to `customer` and made the dashboard unreachable with no visible cause.
// Keeps the Firebase error code so the real reason is recoverable from a console.
function describeFailure(err, fallback) {
  if (!err) return fallback;
  const code = err.code || 'unknown-error';
  const detail = String(err.message || '').split('\n')[0].trim();
  return `${fallback} [${code}${detail ? `: ${detail}` : ''}]`;
}

// Resolves which restaurant a uid owns. Prefers the active deployment
// restaurant (deterministic MVP identity) and logs when ownership is ambiguous
// instead of silently picking.
async function resolveOwnedRestaurant(uid) {
  let owned = [];
  try {
    owned = await getOwnerRestaurants(uid);
  } catch (err) {
    runtimeWarn(
      'auth.ownership-query-failed',
      'Could not read the restaurants collection for',
      uid,
      '— owner recovery is impossible right now:',
      err?.code || err
    );
    devLog('[auth] ownership recovery could not query restaurants', uid, err);
    return null;
  }
  if (!owned.length) return null;

  const target = owned.find((r) => r.id === RESTAURANT_ID) || owned[0];
  if (owned.length > 1) {
    devLog(
      '[auth] multiple owned restaurants for',
      uid,
      'resolving to',
      target && target.id,
      '(owned:)',
      owned.map((r) => r.id)
    );
  }
  // Re-asserted explicitly — ownerId is never inferred.
  if (!target || target.ownerId !== uid) {
    devLog('[auth] ownership could not be verified for', uid);
    return null;
  }
  return target;
}

async function grantRestaurantIdentity(uid, restaurant, existingIds = {}) {
  await db.updateDoc(`users/${uid}`, {
    restaurantId: restaurant.id,
    restaurantIds: { ...(existingIds || {}), [restaurant.id]: true },
    updatedAt: db.nowISO(),
  });
}

async function recoverOwnerProfile(user, existingDoc) {
  if (!user) return null;

  const existing = existingDoc || null;
  const existingRole = existing ? normalizeRole(existing.role) : null;
  const isAdminRole = ADMIN_ROLES.includes(existingRole);

  // A profile that already carries an admin role + identity is preserved as-is.
  if (existing && isAdminRole && hasRestaurantIdentity(existing)) return null;

  const restaurant = await resolveOwnedRestaurant(user.uid);
  if (!restaurant) {
    // No verified ownership. Keep the account exactly as it is and log — we
    // never overwrite an owner/admin (or any) profile with a customer role.
    if (existing && isAdminRole) {
      devLog(
        '[auth] owner/admin profile of',
        user.uid,
        'cannot be repaired (no verified restaurant); keeping existing identity'
      );
    }
    return null;
  }

  if (existing) {
    // Repairable only for admin roles (identity-only; rules forbid role edits).
    // A customer profile backed by a restaurant ownerId is a data conflict —
    // logged, never silently promoted.
    if (!isAdminRole) {
      devLog(
        '[auth] restaurants.<id>.ownerId ==',
        user.uid,
        'but users/',
        user.uid,
        'role is',
        existingRole,
        '— not promoting client-side; manual review required'
      );
      return null;
    }
    try {
      await grantRestaurantIdentity(user.uid, restaurant, existing.restaurantIds);
    } catch (err) {
      devLog('[auth] owner identity repair failed', user.uid, err);
      return null;
    }
    try {
      await seedOwnerSetup(restaurant.id);
    } catch (err) {
      devLog('[auth] owner identity repair seeding failed (non-fatal)', user.uid, err);
    }
    return {
      ...existing,
      restaurantId: restaurant.id,
      restaurantIds: { ...(existing.restaurantIds || {}), [restaurant.id]: true },
    };
  }

  // No profile document → restore it (create without identity, then grant).
  const now = db.nowISO();
  const base = {
    uid: user.uid,
    role: ROLES.RESTAURANT_OWNER,
    name: String(user.displayName || '').trim(),
    email: user.email || '',
    phone: '',
    photoURL: user.photoURL || '',
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.setDoc(`users/${user.uid}`, base);
    await grantRestaurantIdentity(user.uid, restaurant);
  } catch (err) {
    devLog('[auth] owner profile recovery failed', user.uid, err);
    return null;
  }

  const profile = {
    ...base,
    phoneVerified: false,
    restaurantId: restaurant.id,
    restaurantIds: { [restaurant.id]: true },
  };

  try {
    await seedOwnerSetup(restaurant.id);
  } catch (err) {
    devLog('[auth] owner recovery menu seeding failed (non-fatal)', user.uid, err);
  }

  return profile;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  // Why the Firestore profile could not be read this session (null = fine). Kept
  // separate from `authError` (which belongs to explicit form submissions) so a
  // silent data-layer failure can never be mistaken for a customer account.
  const [profileError, setProfileError] = useState(null);
  // Guards against two racy async profile loads (session restore + signup
  // write) overwriting each other. Whichever caller bumps the counter last is
  // authoritative.
  const profileSeq = useRef(0);
  // Sign-in resolves before the auth listener has published the Firestore
  // profile. Anything that routes on the role (post-login redirect) waits on
  // this instead of reading a stale/absent profile.
  const profileWaiters = useRef([]);

  const setProfileState = (profile) => {
    profileSeq.current += 1;
    setUserProfile(profile);
  };

  const settleProfileWaiters = (profile) => {
    const waiters = profileWaiters.current;
    profileWaiters.current = [];
    waiters.forEach((resolve) => resolve(profile));
  };

  // Resolves with the profile published for the session that was just signed in.
  // The timeout is a safety net: routing must never hang if the listener bails
  // out, and every route decision re-checks the role through the guard anyway.
  const waitForProfile = () =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (profile) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(profile || null);
      };
      const timer = setTimeout(() => finish(null), PROFILE_WAIT_TIMEOUT_MS);
      profileWaiters.current.push(finish);
    });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setProfileState(null);
        setProfileError(null);
        setLoading(false);
        settleProfileWaiters(null);
        return;
      }

      const seq = profileSeq.current;
      let profile = null;
      let doc = null;
      let readError = null;
      try {
        doc = await db.getDoc(`users/${user.uid}`);
      } catch (err) {
        readError = err;
        // Loud in every build: this is the difference between "the account is a
        // customer" and "we could not ask the database", and only the error code
        // tells the two apart.
        runtimeWarn(
          'auth.profile-read-failed',
          'Could not read users/' + user.uid + ':',
          err?.code || err,
          '— the role below falls back to "customer" until Firestore is reachable.'
        );
        devLog('[auth] unable to read user profile (will attempt recovery)', user.uid, err);
      }
      if (seq !== profileSeq.current) return; // superseded by a newer write

      if (doc) {
        const base = {
          ...defaultCustomerProfile(user),
          ...doc,
          role: normalizeRole(doc.role),
        };
        // Existing profiles can still be incomplete (owner/admin with a missing
        // or malformed restaurant identity) — repair those; otherwise preserve.
        profile = (await recoverOwnerProfile(user, doc)) || base;
      } else {
        // Missing/unreadable profile → only a verified Firestore restaurant
        // ownership relationship may restore admin access for legacy accounts.
        profile = (await recoverOwnerProfile(user)) || defaultCustomerProfile(user);
      }
      if (seq !== profileSeq.current) return;
      setUserProfile(profile);
      // A failed read is reported, never silently absorbed: the role below is
      // only trustworthy when the profile actually came back from Firestore.
      setProfileError(
        readError
          ? describeFailure(
              readError,
              `Could not read the profile of ${user.uid} from the database`
            )
          : null
      );
      setLoading(false);
      settleProfileWaiters(profile);
    });
    return unsubscribe;
  }, []);

  const clearError = () => setAuthError('');

  const run = async (action) => {
    setAuthError('');
    try {
      const value = await action();
      return { success: true, value };
    } catch (err) {
      const message = getAuthErrorMessage(err.code);
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const signup = (name, email, password, phone, address) =>
    run(async () => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const now = db.nowISO();
      const profile = {
        uid: user.uid,
        role: DEFAULT_ROLE,
        name: String(name || '').trim(),
        email,
        phone: String(phone || '').trim(),
        photoURL: user.photoURL || '',
        phoneVerified: false,
        restaurantId: null,
        restaurantIds: {},
        createdAt: now,
        updatedAt: now,
      };
      // The profile is the server-side record of truth; the listener may have
      // already cached a default profile, so flush the real one immediately.
      await db.setDoc(`users/${user.uid}`, profile);
      setProfileState(profile);
      if (name) await updateProfile(user, { displayName: name });
    });

  // Owner onboarding: Firebase account → claim/create the SINGLE deployment
  // restaurant → owner document → restaurant identity → menu seeding.
  // Onboarding establishes the restaurant first so a taken storefront fails the
  // registration cleanly instead of leaving an identity-less owner. The
  // restaurant identity step MUST precede seeding because the rules only let a
  // *member* write a restaurant's categories/products.
  const signupOwner = (name, email, password, restaurantName) =>
    run(async () => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const now = db.nowISO();

      let restaurant;
      try {
        restaurant = await onboardOwnerRestaurant({
          ownerId: user.uid,
          name: restaurantName,
        });
      } catch (err) {
        // Fresh registration that cannot claim the storefront is cleaned up so
        // no stray identity-less owner account lingers.
        try {
          await deleteUser(user);
        } catch (cleanupErr) {
          devLog('[auth] could not clean up a failed owner registration', user.uid, cleanupErr);
        }
        throw err;
      }

      const base = {
        uid: user.uid,
        role: ROLES.RESTAURANT_OWNER,
        name: String(name || '').trim(),
        email,
        phone: '',
        photoURL: user.photoURL || '',
        createdAt: now,
        updatedAt: now,
      };
      const profile = {
        ...base,
        phoneVerified: false,
        restaurantId: restaurant.id,
        restaurantIds: { [restaurant.id]: true },
      };

      // Profile is created without identity, then identity is granted so the
      // rules verify ownership against the restaurant's ownerId.
      await db.setDoc(`users/${user.uid}`, base);
      await db.updateDoc(`users/${user.uid}`, {
        restaurantId: restaurant.id,
        restaurantIds: { [restaurant.id]: true },
        updatedAt: db.nowISO(),
      });
      await seedOwnerSetup(restaurant.id);

      setProfileState(profile);
      if (name) await updateProfile(user, { displayName: name });
    });

  // `signInWithEmailAndPassword` resolves as soon as Firebase has a session; the
  // role and restaurant identity arrive from Firestore a moment later. Waiting
  // for that profile is what lets the caller route an owner to the dashboard
  // instead of guessing from a role that has not loaded yet.
  const login = (email, password, remember) =>
    run(async () => {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );
      const profileReady = waitForProfile();
      await signInWithEmailAndPassword(auth, email, password);
      return { profile: await profileReady };
    });

  const loginWithGoogle = () =>
    run(async () => {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      const profileReady = waitForProfile();
      await signInWithPopup(auth, provider);
      return { profile: await profileReady };
    });

  const forgotPassword = (email) =>
    run(async () => {
      await sendPasswordResetEmail(auth, email);
    });

  const updateProfileData = (data) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      const authUpdates = {};
      if (data.displayName !== undefined) authUpdates.displayName = data.displayName;
      if (data.photoURL !== undefined) authUpdates.photoURL = data.photoURL;
      if (Object.keys(authUpdates).length > 0) {
        await updateProfile(user, authUpdates);
      }
      const patch = { ...stripIdentityFields(data), updatedAt: db.nowISO() };
      await db.updateDoc(`users/${user.uid}`, patch);
      setProfileState({ ...(userProfile || {}), ...patch });
    });

  const reauthenticateWithPassword = (password) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password)
      );
    });

  const reauthenticateWithGoogle = () =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    });

  const resendVerificationEmail = () =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      await sendEmailVerification(user);
    });

  const changeEmail = (newEmail, password) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password)
      );
      await updateEmail(user, newEmail);
      // Firebase resets emailVerified to false after an email change; we send a
      // fresh verification and never claim the new address is verified.
      await sendEmailVerification(user);
      await db.updateDoc(`users/${user.uid}`, { email: newEmail, updatedAt: db.nowISO() });
      setProfileState({ ...(userProfile || {}), email: newEmail });
    });

  const changePassword = (currentPassword, newPassword) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, currentPassword)
      );
      await updatePassword(user, newPassword);
    });

  const deleteAccount = (password) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not signed in.');
      }
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password)
      );
      await deleteUser(user);
      try {
        await db.deleteDoc(`users/${user.uid}`);
      } catch (err) {
        /* doc may not exist — account deletion already succeeded */
      }
      removeUserData(user.uid);
      setCurrentUser(null);
      setProfileState(null);
    });

  const logout = () =>
    run(async () => {
      await signOut(auth);
      setProfileState(null);
      setProfileError(null);
    });

  const value = {
    currentUser,
    userProfile,
    role: currentUser ? normalizeRole(userProfile?.role) : null,
    isAdmin: roleHasAdminAccess(userProfile?.role),
    loading,
    authError,
    // Non-null when the Firestore profile could not be read this session: the
    // role above is then a fallback, not a fact about the account.
    profileError,
    clearError,
    signup,
    signupOwner,
    login,
    loginWithGoogle,
    forgotPassword,
    updateProfileData,
    reauthenticateWithPassword,
    reauthenticateWithGoogle,
    resendVerificationEmail,
    changeEmail,
    changePassword,
    deleteAccount,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        // Shown while Firebase restores the session and we load the profile.
        // Doing this here guarantees no protected route redirects before the
        // auth/profile request has finished.
        <div className="auth-page" data-testid="checking-auth">
          <div className="auth-card">
            <p>Checking authentication…</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export default AuthContext;