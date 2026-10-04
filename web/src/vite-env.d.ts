/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" sends the X-Dev-User header from a production build (local walks against an API with ORALCOMPASS_DEV_AUTH=1). Never set for a deployment. */
  readonly VITE_DEV_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
