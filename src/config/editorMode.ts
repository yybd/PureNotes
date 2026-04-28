// editorMode.ts
// Feature flag controlling which rich text editor implementation the app uses.
//
// FLIPPING THIS FLAG IS THE ROLLBACK PATH for the react-native-enriched
// migration. If anything regresses on iOS or Android, set USE_NATIVE_EDITOR
// to a constant `false` and the app silently reverts to the
// @10play/tentap-editor (WebView-based) path with no other code changes.
//
// PLATFORM SCOPE:
//
//   - iOS / Android: react-native-enriched (native UITextView / EditText).
//     ZERO cold start, no WKWebView WebContent process to wait for. This
//     is the whole point of the migration — solves the iPad 4-6 s
//     first-tap freeze caused by iOS WebKit cold start.
//
//   - Web: legacy @10play/tentap-editor (WebView, which on Web is just
//     a normal browser DOM, no cold-start problem). RNE *ships* a web
//     build (src/index.web.tsx → Tiptap React), but Metro for Web
//     resolves the native source file `EnrichedTextInputNativeComponent.ts`
//     which imports `codegenNativeCommands` — a symbol that doesn't exist
//     in react-native-web — producing a runtime TypeError on page load.
//     Until RNE's web export is fixed, gating USE_NATIVE_EDITOR off Web
//     is the cleanest workaround. The Tiptap path on Web has always
//     worked well, so we lose nothing.
import { Platform } from 'react-native';
export const USE_NATIVE_EDITOR = Platform.OS !== 'web';
