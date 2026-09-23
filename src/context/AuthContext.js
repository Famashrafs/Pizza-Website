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
import { ROLES, DEFAULT_ROLE, normalizeRole, roleHasAdminAccess } from '../config/roles';
import {
  getOwnerRestaurant,
  onboardOwnerRestaurant,
  seedOwnerSetup,
} from '../services/restaurantService';
import { devLog } from '../utils/devLog';

const AuthContext = createContext();

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

// Legacy-owner recovery (migration from before `users/{uid}` documents existed).
//
// For a signed-in user whose Firestore profile is missing, we ONLY restore owner
// access when a Firestore `restaurants` document explicitly lists
// `ownerId == currentUser.uid`. That document relationship is the authority —
// never localStorage, email address, URL, or a client-side role.
//
// The write is deliberately split in two so `firestore.rules` can verify it:
//   1. create the profile WITHOUT a restaurant identity (the create rule now
//      forbids claiming ownership on create), then
//   2. attach the identity through the ownership-grant update, which the rules
//      re-verify against the restaurant's `ownerId`.
// Returns the recovered profile, or null when ownership cannot be verified
// (the caller then falls back to a default customer profile).
async function recoverOwnerProfile(user) {
  if (!user) return null;

  let restaurant = null;
  try {
    restaurant = await getOwnerRestaurant(user.uid);
  } catch (err) {
    devLog('[auth] owner recovery could not verify restaurant ownership', user.uid, err);
    return null;
  }
  // getOwnerRestaurant already filters by ownerId, but the relationship is
  // re-asserted explicitly — it must never be inferred.
  if (!restaurant || restaurant.ownerId !== user.uid) return null;

  const now = db.nowISO();
  const profile = {
    uid: user.uid,
    role: ROLES.RESTAURANT_OWNER,
    name: String(user.displayName || '').trim(),
    email: user.email || '',
    phone: '',
    photoURL: user.photoURL || '',
    phoneVerified: false,
    restaurantId: restaurant.id,
    restaurantIds: { [restaurant.id]: true },
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.setDoc(`users/${user.uid}`, {
      uid: user.uid,
      role: ROLES.RESTAURANT_OWNER,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      photoURL: profile.photoURL,
      createdAt: now,
      updatedAt: now,
    });
    await db.updateDoc(`users/${user.uid}`, {
      restaurantId: restaurant.id,
      restaurantIds: { [restaurant.id]: true },
      updatedAt: db.nowISO(),
    });
  } catch (err) {
    devLog('[auth] owner recovery profile write failed', user.uid, err);
    return null;
  }

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
  // Guards against two racy async profile loads (session restore + signup
  // write) overwriting each other. Whichever caller bumps the counter last is
  // authoritative.
  const profileSeq = useRef(0);

  const setProfileState = (profile) => {
    profileSeq.current += 1;
    setUserProfile(profile);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setProfileState(null);
        setLoading(false);
        return;
      }

      const seq = profileSeq.current;
      let profile = null;
      let doc = null;
      try {
        doc = await db.getDoc(`users/${user.uid}`);
      } catch (err) {
        devLog('[auth] unable to read user profile (will attempt recovery)', user.uid, err);
      }
      if (seq !== profileSeq.current) return; // superseded by a newer write

      if (doc) {
        profile = {
          ...defaultCustomerProfile(user),
          ...doc,
          role: normalizeRole(doc.role),
        };
      } else {
        // Missing/unreadable profile → only a verified Firestore restaurant
        // ownership relationship may restore admin access for legacy accounts.
        profile = (await recoverOwnerProfile(user)) || defaultCustomerProfile(user);
      }
      if (seq !== profileSeq.current) return;
      setUserProfile(profile);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const clearError = () => setAuthError('');

  const run = async (action) => {
    setAuthError('');
    try {
      await action();
      return { success: true };
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

  // Owner onboarding: Firebase account → owner document → restaurant
  // claim/create → restaurant identity on the user document → menu seeding.
  // The restaurant identity step MUST precede seeding because the rules only
  // let a *member* write a restaurant's categories/products.
  const signupOwner = (name, email, password, restaurantName) =>
    run(async () => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const now = db.nowISO();

      await db.setDoc(`users/${user.uid}`, {
        uid: user.uid,
        role: ROLES.RESTAURANT_OWNER,
        name: String(name || '').trim(),
        email,
        phone: '',
        photoURL: user.photoURL || '',
        createdAt: now,
        updatedAt: now,
      });

      const restaurant = await onboardOwnerRestaurant({
        ownerId: user.uid,
        name: restaurantName,
      });

      if (restaurant) {
        await db.updateDoc(`users/${user.uid}`, {
          restaurantId: restaurant.id,
          restaurantIds: { [restaurant.id]: true },
          updatedAt: db.nowISO(),
        });
        await seedOwnerSetup(restaurant.id);
      }

      const profile = {
        uid: user.uid,
        role: ROLES.RESTAURANT_OWNER,
        name: String(name || '').trim(),
        email,
        phone: '',
        photoURL: user.photoURL || '',
        phoneVerified: false,
        restaurantId: restaurant?.id || null,
        restaurantIds: restaurant ? { [restaurant.id]: true } : {},
        createdAt: now,
        updatedAt: now,
      };
      setProfileState(profile);
      if (name) await updateProfile(user, { displayName: name });
    });

  const login = (email, password, remember) =>
    run(async () => {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, email, password);
    });

  const loginWithGoogle = () =>
    run(async () => {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
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
    });

  const value = {
    currentUser,
    userProfile,
    role: currentUser ? normalizeRole(userProfile?.role) : null,
    isOwner: roleHasAdminAccess(userProfile?.role),
    loading,
    authError,
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