// Backend cleanup helpers for the authed specs — remove the webdb_* rows a test created via the
// same authenticated DELETE endpoints the app exposes (deleteAnalysis, deleteCollectionGame).
// The test account's baseline is empty, so a collection sweep for a variant is safe; analyses are
// swept by a per-spec name marker so concurrent-looking runs never step on unrelated data.
async function listAnalyses(request) {
  const r = await request.get('/api/db/analyses');
  if (!r.ok()) return [];
  return (await r.json()).analyses || [];
}

async function listCollection(request, game = 1) {
  const r = await request.get(`/api/db/collection?game=${game}&offset=0&limit=200`);
  if (!r.ok()) return [];
  return (await r.json()).games || [];
}

async function deleteAnalysis(request, aid) {
  await request.delete(`/api/db/analyses/${aid}`);
}

async function deleteCollectionGame(request, wgid) {
  await request.delete(`/api/db/collection/${wgid}`);
}

// Remove analyses whose name contains `marker`, and every collection game for `games` variants.
async function sweep(request, { marker, games = [1] } = {}) {
  for (const a of await listAnalyses(request)) {
    if (!marker || (a.name || '').includes(marker)) await deleteAnalysis(request, a.aid);
  }
  for (const g of games) {
    for (const row of await listCollection(request, g)) {
      await deleteCollectionGame(request, row.gid);
    }
  }
}

module.exports = {
  listAnalyses,
  listCollection,
  deleteAnalysis,
  deleteCollectionGame,
  sweep,
};
