import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore is not available on web, so we need to use localStorage as a fallback
const tokenCache = {
  async getToken(key: string) {
    try {
      console.log(`Getting token for key: ${key}`);
      if (Platform.OS === 'web') {
        const value = window.localStorage.getItem(key);
        console.log(`Retrieved web token: ${key} = ${value ? '[PRESENT]' : '[MISSING]'}`);
        return value;
      } else {
        const value = await SecureStore.getItemAsync(key);
        console.log(`Retrieved native token: ${key} = ${value ? '[PRESENT]' : '[MISSING]'}`);
        return value;
      }
    } catch (err) {
      console.error(`Error getting token for key: ${key}`, err);
      return null;
    }
  },
  
  async saveToken(key: string, value: string) {
    try {
      console.log(`Saving token for key: ${key}`);
      if (Platform.OS === 'web') {
        window.localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (err) {
      console.error(`Error saving token for key: ${key}`, err);
    }
  },
  
  async removeToken(key: string) {
    try {
      console.log(`Removing token for key: ${key}`);
      if (Platform.OS === 'web') {
        window.localStorage.removeItem(key);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (err) {
      console.error(`Error removing token for key: ${key}`, err);
    }
  }
};

export default tokenCache;