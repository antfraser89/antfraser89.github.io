# Wrapping Park! for the app stores

Park! is a web game. From the browser it already installs to a phone's home screen and plays offline. To put it in the App Store or on Google Play it needs a native shell round it, and that shell is also where real adverts and purchases are connected. None of this has been done or tested yet; this page is the checklist.

## 1. The shell

Any tool that shows a folder of web files in a full-screen web view will do. With [Capacitor](https://capacitorjs.com), from the repository root:

```sh
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Park!" com.yourname.park --web-dir park
npx cap add android
npx cap add ios        # needs a Mac with Xcode
npx cap sync
npx cap open android   # then build and run from Android Studio
```

Things to set in the native projects:

- Portrait only.
- A full-screen web view that draws under the status bar (the game keeps its own top bar clear of it, and keeps clear of the home indicator).
- The app icon and launch screen: `park/icon-512.png` and `park/img/splash.webp` are the sources.
- In `park/js/main.js` the service worker is only registered over `http(s)`. Inside a shell the files are local already, so nothing needs changing.

## 2. The bridge

The game asks for adverts and purchases through one object, `window.ParkBridge` (see "Adverts and purchases" in the main README). `park-bridge.example.js` in this folder is a skeleton: copy it into `park/`, load it from `index.html` before `js/main.js`, and fill in each function with calls to the advert and purchase plugins you choose. Until every function is filled in and tested on a device, leave `STORE_PREVIEW` as it is or set it to `false`; never ship with preview purchases switched on.

What the game expects:

- `showRewarded(placement)` resolves `true` only when the advert has been watched to the end. If it fails to load, is skipped, or the app is interrupted, resolve `false`: the game then gives nothing and uses up none of the player's daily allowance.
- `purchase(productId)` resolves `true` only when the store has confirmed payment. The game hands over the goods once, in `rules.applyPurchase`. Keep receipts on your side and add a "restore purchases" path for the one-off products (`starter`, `noads`) and for the current season's `pass`.
- `prices` lets the store's localised price strings replace the placeholders.

## 3. Before submitting

- Product IDs in the stores must match the `id`s in `PRODUCTS` in `park/js/config.js`.
- Fill in the publisher's name and contact address in `park/privacy.html` and `park/terms.html`, and add the advert and payment providers to the privacy page.
- Answer the stores' age-rating questions about simulated gambling and random paid items truthfully: the game has a slot-style machine and random card packs. Pack odds are shown in the game (Offers, "Card pack odds").
- Play it through on a small phone, a large phone and a tablet.
