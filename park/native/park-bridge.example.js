// A skeleton for window.ParkBridge. EXAMPLE ONLY: not connected to anything
// and not tested. Fill in each function with your advert and purchase
// plugins, then load this file from index.html before js/main.js.
//
// Rule of thumb: resolve true only when you are certain. A false costs the
// player nothing; a wrong true gives things away.
window.ParkBridge = {
  // Localised price strings by product id, once the store has been asked.
  prices: {},

  // placement: 'tokens', 'energy', 'pearls', 'shots', 'keys', 'wheel', 'boost' or 'away'.
  async showRewarded(placement) {
    try {
      // 1. Load a rewarded advert for this placement.
      // 2. Show it and wait for the plugin's "reward earned" event.
      // 3. Return true only if that event arrived before the advert closed.
      void placement;
      return false;
    } catch {
      return false;
    }
  },

  // placement: 'travel' (between parks). Never called once "No interruptions" is owned.
  async showInterstitial(placement) {
    try {
      // Show an interstitial if one is loaded; resolve when it has closed.
      void placement;
    } catch {
      // An advert that fails must never hold the game up.
    }
  },

  // productId: an id from PRODUCTS in js/config.js.
  async purchase(productId) {
    try {
      // 1. Start the store's purchase flow for productId.
      // 2. Wait for the store to confirm payment (and verify the receipt if you can).
      // 3. Finish / acknowledge the transaction, then return true.
      void productId;
      return false;
    } catch {
      return false;
    }
  },
};
