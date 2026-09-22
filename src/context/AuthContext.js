import React, { createContext, useContext, useEffect, useState } from 'react';
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
import { getUserData, saveUserData, removeUserData } from '../services/storage';
import { ROLES, DEFAULT_ROLE, normalizeRole, roleHasAdminAccess } from '../config/roles';
import { onboardOwnerRestaurant } from '../services/restaurantService';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        let profile = getUserData(user.uid);
        // Accounts created before the role system existed default to customer.
        if (normalizeRole(profile.role) !== profile.role) {
          profile = { ...profile, role: DEFAULT_ROLE };
          saveUserData(user.uid, profile);
        }
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setCurrentUser(user);
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
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = credential.user;
      const now = new Date().toISOString();
      const profile = {
        role: DEFAULT_ROLE,
        phone,
        address,
        email,
        createdAt: now,
        updatedAt: now,
      };
      saveUserData(user.uid, profile);
      // Set the profile immediately: the auth-state listener may have already
      // run (before this write) and cached a default profile.
      setUserProfile(profile);
      await updateProfile(user, { displayName: name });
    });

  // Owner onboarding: creates the Firebase account, establishes the
  // Owner -> Restaurant relationship, then tags the owner's profile with the
  // restaurantId. The restaurant is persisted through restaurantService.
  const signupOwner = (name, email, password, restaurantName) =>
    run(async () => {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = credential.user;
      const restaurant = onboardOwnerRestaurant({
        ownerId: user.uid,
        name: restaurantName,
      });
      const now = new Date().toISOString();
      const profile = {
        role: ROLES.RESTAURANT_OWNER,
        restaurantId: restaurant?.id || null,
        email,
        createdAt: now,
        updatedAt: now,
      };
      saveUserData(user.uid, profile);
      // Set the profile immediately: the auth-state listener may have already
      // run (before this write) and cached a default customer profile, which
      // would otherwise lock the new owner out of /admin.
      setUserProfile(profile);
      await updateProfile(user, { displayName: name });
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
      const updates = {};
      if (data.displayName !== undefined) updates.displayName = data.displayName;
      if (data.photoURL !== undefined) updates.photoURL = data.photoURL;
      if (Object.keys(updates).length > 0) {
        await updateProfile(user, updates);
      }
      const profile = { ...getUserData(user.uid), ...data };
      saveUserData(user.uid, profile);
      setUserProfile(profile);
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
      const profile = { ...getUserData(user.uid), email: newEmail };
      saveUserData(user.uid, profile);
      setUserProfile(profile);
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
      removeUserData(user.uid);
      setCurrentUser(null);
      setUserProfile(null);
    });

  const logout = () =>
    run(async () => {
      await signOut(auth);
      setUserProfile(null);
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