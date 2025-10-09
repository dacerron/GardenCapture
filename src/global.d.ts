/// <reference types="google.maps" />

declare global {
  interface Window {
    // `google` is added by the Maps script at runtime
    google?: typeof google;
  }
}
export {}; // make this a module
