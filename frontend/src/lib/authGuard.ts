import { useAuthStore } from '../store/authStore';
import tokenManager from './tokenManager';

/**
 * Authentication guard utility to prevent API calls when user is not authenticated
 */
export const authGuard = {
  /**
   * Check if user is authenticated and authorized to make API calls
   */
  canMakeApiCall(): boolean {
    const { isAuthenticated, user } = useAuthStore.getState();
    const token = tokenManager.getAccessToken();
    // isAuthenticated is a boolean in the store, not a function
    return !!(token && isAuthenticated && user);
  },

  /**
   * Check if user is authenticated and approved for full access
   */
  canAccessProtectedFeatures(): boolean {
    const { isAuthenticated, user } = useAuthStore.getState();
    const token = tokenManager.getAccessToken();
    return !!(token && isAuthenticated && user);
  },

  /**
   * Wrapper for API calls that should only execute if user is authenticated
   */
  async executeIfAuthenticated<T>(apiCall: () => Promise<T>): Promise<T | null> {
    if (!this.canMakeApiCall()) {
      return null;
    }
    return apiCall();
  },

  /**
   * Wrapper for API calls that should only execute if user has full access
   */
  async executeIfAuthorized<T>(apiCall: () => Promise<T>): Promise<T | null> {
    if (!this.canAccessProtectedFeatures()) {
      return null;
    }
    return apiCall();
  }
};