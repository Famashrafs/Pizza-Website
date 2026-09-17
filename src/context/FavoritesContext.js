import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getFavorites, saveFavorites } from '../services/storage';

const FavoritesContext = createContext();

export function useFavorites() {
  return useContext(FavoritesContext);
}

export function FavoritesProvider({ children }) {
  const { currentUser } = useAuth();
  const key = currentUser ? currentUser.uid : 'guest';

  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    setFavorites(getFavorites(key));
  }, [key]);

  const isFavorite = (id) => favorites.some((fav) => fav.id === id);

  const toggleFavorite = (item) => {
    setFavorites((prev) => {
      const exists = prev.some((fav) => fav.id === item.id);
      const next = exists
        ? prev.filter((fav) => fav.id !== item.id)
        : [{ id: item.id, name: item.name, price: item.price, image: item.image }, ...prev];
      saveFavorites(key, next);
      return next;
    });
    return !isFavorite(item.id);
  };

  const removeFavorite = (itemId) => {
    setFavorites((prev) => {
      const next = prev.filter((fav) => fav.id !== itemId);
      saveFavorites(key, next);
      return next;
    });
  };

  const value = { favorites, isFavorite, toggleFavorite, removeFavorite };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export default FavoritesContext;