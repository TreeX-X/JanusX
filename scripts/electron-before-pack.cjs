'use strict'

// electron-builder calls beforeBuild before it packs, and a `false` return tells
// it that node_modules is already prepared outside of electron-builder. That
// makes electron-builder copy the installed tree verbatim through `files` instead
// of re-deriving a dependency tree with `node-dep-tree --flatten`.
//
// That re-derivation is what nested a hoisted package under the wrong parent and
// left it absent from app.asar's node_modules root, so root-level consumers threw
// ERR_MODULE_NOT_FOUND and the 0.8.7 portable and setup builds died during
// bootstrap with no window, no dialog and no log. Copying the tree npm actually
// installed keeps every hoisted dependency resolvable from the archive.
//
// This also skips electron-builder's own dependency install/rebuild pass, which
// `npmRebuild: false` had already disabled.
// Note: entry — see .agents/notes/2026-09-20-packaged-hoisted-deps--39f58575.md

async function beforeBuild() {
  return false
}

module.exports = beforeBuild
module.exports.beforeBuild = beforeBuild
