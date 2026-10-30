# かぞくハブ

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

## 公開リンク

- **Vercel公開版**: https://kazoku-hub.vercel.app
- **Manus管理版**: https://kazoku-qha68ixe.manus.space
- **ソースコード**: https://github.com/Yuki012424/kazoku-hub

Vercel公開版は入試担当者向けの確認用URLです。家族アカウントでのログインや共有機能を確認するときは、Manus管理版も利用できます。

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
