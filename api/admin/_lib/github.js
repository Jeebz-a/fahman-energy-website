// Thin GitHub REST API wrapper for committing files atomically to the repo.
// Uses the Trees API so a single commit touches multiple files
// (post html + hero image + blog.html + sitemap.xml) → Vercel rebuilds once.

const GH = 'https://api.github.com';

export const REPO_OWNER = 'Jeebz-a';
export const REPO_NAME = 'fahman-energy-website';
export const REPO_BRANCH = 'main';

function token() {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error('GITHUB_TOKEN env var is not set');
  return t;
}

function headers(extra = {}) {
  return {
    'Authorization': `Bearer ${token()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'fahman-energy-admin/1.0',
    ...extra,
  };
}

async function gh(path, init = {}) {
  const url = path.startsWith('http') ? path : `${GH}/repos/${REPO_OWNER}/${REPO_NAME}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(init.headers), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub ${init.method || 'GET'} ${path} → ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Returns the file content as a UTF-8 string + its blob SHA, or null if missing. */
export async function getFileText(path, ref = REPO_BRANCH) {
  try {
    const json = await gh(`/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`);
    if (!json || json.type !== 'file' || !json.content) return null;
    const buf = Buffer.from(json.content, json.encoding || 'base64');
    return { text: buf.toString('utf8'), sha: json.sha };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** Returns an array of filenames in a directory, or [] if the dir doesn't exist. */
export async function listDir(path, ref = REPO_BRANCH) {
  try {
    const json = await gh(`/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`);
    if (!Array.isArray(json)) return [];
    return json.map((entry) => ({ name: entry.name, type: entry.type, path: entry.path, sha: entry.sha }));
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/** Returns true if a path exists in the repo. */
export async function fileExists(path, ref = REPO_BRANCH) {
  try {
    const json = await gh(`/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`);
    return !!json;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

/**
 * Atomically commit multiple file changes in a single commit on the branch.
 *
 * @param {object} args
 * @param {string} args.message - commit message
 * @param {string} [args.branch] - branch to update (default 'main')
 * @param {Array<{path:string, content:string|Buffer, encoding?:'utf-8'|'base64'}>} args.files
 * @returns {Promise<{commitSha:string, htmlUrl:string}>}
 */
export async function commitFiles({ message, branch = REPO_BRANCH, files }) {
  if (!files || !files.length) throw new Error('No files to commit');

  // 1. Get the latest commit SHA for the branch.
  const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const latestCommitSha = ref.object.sha;

  // 2. Get the latest commit (to find its tree SHA).
  const latestCommit = await gh(`/git/commits/${latestCommitSha}`);
  const baseTreeSha = latestCommit.tree.sha;

  // 3. Create blobs for each file.
  const blobs = await Promise.all(files.map(async (f) => {
    const content = Buffer.isBuffer(f.content) ? f.content.toString('base64') : (f.encoding === 'base64' ? f.content : Buffer.from(f.content, 'utf8').toString('base64'));
    const blob = await gh('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'base64' }),
    });
    return { path: f.path.replace(/^\/+/, ''), mode: '100644', type: 'blob', sha: blob.sha };
  }));

  // 4. Create a new tree based on the existing tree + our changes.
  const tree = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
  });

  // 5. Create the commit pointing to the new tree.
  const commit = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [latestCommitSha] }),
  });

  // 6. Update the branch ref to point at the new commit.
  await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    commitSha: commit.sha,
    htmlUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${commit.sha}`,
  };
}
