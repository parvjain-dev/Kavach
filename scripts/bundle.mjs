// Bundles only the Firebase pieces we use into one file so the site has no CDN dependency.
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('scripts/.tmp', { recursive: true });
writeFileSync('scripts/.tmp/entry.js', `
export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signInAnonymously, signOut } from 'firebase/auth';
export { getFirestore, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
`);
await build({ entryPoints: ['scripts/.tmp/entry.js'], bundle: true, format: 'esm', minify: true, outfile: 'public/firebase.bundle.js', target: 'es2020', logLevel: 'info' });
