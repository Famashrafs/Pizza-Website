import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  signInAnonymously,
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
  getRestaurantById,
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

// Owner recovery (migration from before `users/{uid}` documents existed, or
// from partial profile writes).
//
// Owner status is ONLY restored from the fixed restaurant document when
// `restaurants/{RESTAURANT_ID}.ownerId == currentUser.uid`. That document
// relationship is the authority - never localStorage, email address, URL, or a
// client role. Public owner registration no longer exists.
//
// Rule-safe write sequence:
//   1. create the profile WITHOUT a restaurant identity, then
//   2. attach the identity through the ownership-grant update, which the rules
//      re-verify against the restaurant's `ownerId`.
//
// Recovery never silently promotes a customer into an owner and never
// overwrites an existing admin identity.

function hasRestaurantIdentity(profile) {
  return !!(profile && profile.restaurantId === RESTAURANT_ID);
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

// Resolves whether the uid owns the deployment restaurant. This is the ONLY
// ownership source; a detached or legacy restaurant record never grants access.
async function resolveOwnedRestaurant(uid) {
  let restaurant = null;
  try {
    restaurant = await getRestaurantById(RESTAURANT_ID);
  } catch (err) {
    runtimeWarn(
      'auth.ownership-read-failed',
      'Could not read restaurants/' + RESTAURANT_ID + ' for',
      uid,
      '- owner recovery is impossible right now:',
      err?.code || err
    );
    devLog('[auth] ownership recovery could not read the restaurant', uid, err);
    return null;
  }
  if (!restaurant || restaurant.ownerId !== uid) {
    if (restaurant?.ownerId) {
      devLog('[auth] ownership could not be verified for', uid);
    }
    return null;
  }
  return restaurant;
}

async function grantRestaurantIdentity(uid, restaurant) {
  await db.updateDoc(`users/${uid}`, {
    restaurantId: restaurant.id,
    // Keep the legacy membership map in sync as well. Firestore rules accept
    // either identity field, while older dashboards and migrations may still
    // inspect `restaurantIds`.
    restaurantIds: {
      [restaurant.id]: true,
    },
    updatedAt: db.nowISO(),
  });
}

async function recoverOwnerProfile(user, existingDoc) {
  if (!user) return null;

  const existing = existingDoc || null;
  const existingRole = existing ? normalizeRole(existing.role) : null;
  const isAdminRole = ADMIN_ROLES.includes(existingRole);

  // A profile that already carries an admin role + fixed identity is preserved.
  if (existing && isAdminRole && hasRestaurantIdentity(existing)) return null;

  const restaurant = await resolveOwnedRestaurant(user.uid);
  if (!restaurant) {
    // No verified ownership. Keep the account exactly as it is and log - we
    // never overwrite an owner/admin (or any) profile with a customer role.
    if (existing && isAdminRole) {
      devLog(
        '[auth] owner/admin profile of',
        user.uid,
        'cannot be repaired (no verified ownership); keeping existing identity'
      );
    }
    return null;
  }

  if (existing) {
    // Repairable only for admin roles (identity-only; rules forbid role edits).
    // A customer profile backed by the restaurant ownerId is a data conflict -
    // logged, never silently promoted.
    if (!isAdminRole) {
      devLog(
        '[auth] restaurants.' + RESTAURANT_ID + '.ownerId ==',
        user.uid,
        'but users/',
        user.uid,
        'role is',
        existingRole,
        '- not promoting client-side; manual review required'
      );
      return null;
    }
    try {
      await grantRestaurantIdentity(user.uid, restaurant);
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
    };
  }

  // No profile document -> restore it (create without identity, then grant).
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
  };

  try {
    await seedOwnerSetup(restaurant.id);
  } catch (err) {
    devLog('[auth] owner recovery menu seeding failed (non-fatal)', user.uid, err);
  }

  return profile;
}
export function AuthProvider({ children }) {
  const { t, i18n } = useTranslation();
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
  // The CODE of the last auth failure. The message itself is cached in
  // `authError` (state), so the code is kept next to it to be able to
  // re-translate the message when the language changes.
  const authErrorCode = useRef(null);

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

      if (user.isAnonymous) {
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
        // A genuinely missing profile may be restored from verified restaurant
        // ownership. A read failure is different: the profile's role could not
        // be established, so owner recovery must fail closed until Firestore
        // is reachable again.
        profile = readError
          ? defaultCustomerProfile(user)
          : (await recoverOwnerProfile(user)) || defaultCustomerProfile(user);
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

  const clearError = () => {
    authErrorCode.current = null;
    setAuthError('');
  };

  const run = async (action) => {
    authErrorCode.current = null;
    setAuthError('');
    try {
      const value = await action();
      return { success: true, value };
    } catch (err) {
      const message = getAuthErrorMessage(err.code);
      authErrorCode.current = err.code || null;
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  // An error that is already on screen is cached in state, so a language
  // switch would leave it in the previous language. Re-translate it from the
  // stored code instead.
  useEffect(() => {
    if (authErrorCode.current) {
      setAuthError(getAuthErrorMessage(authErrorCode.current));
    }
  }, [i18n.language]);

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
        createdAt: now,
        updatedAt: now,
      };
      // The profile is the server-side record of truth; the listener may have
      // already cached a default profile, so flush the real one immediately.
      await db.setDoc(`users/${user.uid}`, profile);
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
        throw new Error(t('auth.errorNotSignedIn'));
      }
      const previousDisplayName = user.displayName || '';
      const previousPhotoURL = user.photoURL || userProfile?.photoURL || '';
      const authUpdates = {};
      if (data.displayName !== undefined) authUpdates.displayName = data.displayName;
      if (data.photoURL !== undefined) authUpdates.photoURL = data.photoURL;

      // Firebase Auth and Firestore both expose the profile photo. Update Auth
      // first, then persist the authoritative Firestore document. If the
      // Firestore write fails, restore Auth so the image pipeline can safely
      // delete the newly uploaded object without leaving a split profile.
      if (Object.keys(authUpdates).length > 0) {
        await updateProfile(user, authUpdates);
      }

      const patch = { ...stripIdentityFields(data), updatedAt: db.nowISO() };
      try {
        await db.updateDoc(`users/${user.uid}`, patch);
      } catch (error) {
        const rollback = {};
        if (data.displayName !== undefined) rollback.displayName = previousDisplayName;
        if (data.photoURL !== undefined) rollback.photoURL = previousPhotoURL;
        if (Object.keys(rollback).length > 0) {
          try {
            await updateProfile(user, rollback);
          } catch (rollbackError) {
            error.authRollbackFailed = true;
            error.rollbackError = rollbackError;
          }
        }
        throw error;
      }
      setProfileState({ ...(userProfile || {}), ...patch });
    });

  const reauthenticateWithPassword = (password) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error(t('auth.errorNotSignedIn'));
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
        throw new Error(t('auth.errorNotSignedIn'));
      }
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    });

  const resendVerificationEmail = () =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error(t('auth.errorNotSignedIn'));
      }
      await sendEmailVerification(user);
    });

  const changeEmail = (newEmail, password) =>
    run(async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error(t('auth.errorNotSignedIn'));
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
        throw new Error(t('auth.errorNotSignedIn'));
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
        throw new Error(t('auth.errorNotSignedIn'));
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

  const ensureGuestSession = () =>
    run(async () => {
      if (auth.currentUser) {
        return auth.currentUser;
      }
      const credential = await signInAnonymously(auth);
      return credential.user;
    });

  const logout = () =>
    run(async () => {
      await signOut(auth);
      setProfileState(null);
      setProfileError(null);
    });

  const isGuest = Boolean(currentUser?.isAnonymous);

  const value = {
    currentUser,
    userProfile,
    role:
      currentUser && !currentUser.isAnonymous
        ? normalizeRole(userProfile?.role)
        : null,
    isAdmin: roleHasAdminAccess(userProfile?.role),
    isGuest,
    loading,
    authError,
    // Non-null when the Firestore profile could not be read this session: the
    // role above is then a fallback, not a fact about the account.
    profileError,
    clearError,
    signup,
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
    signInAsGuest: ensureGuestSession,
    ensureGuestSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        // Shown while Firebase restores the session and we load the profile.
        // Doing this here guarantees no protected route redirects before the
        // auth/profile request has finished.
        <div className="auth-page" data-testid="checking-auth">
          <div className="auth-card">
            <p>{t('auth.checkingAuthentication')}</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export default AuthContext;