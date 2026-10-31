/** Common Git situations with the commands that solve them. {branch}, {commit}, {file} and {remote} are filled in. */

export interface Scenario {
  id: string;
  group: string;
  question: string;
  commands: string[];
  explain: string;
  /** Set when the commands can lose work or rewrite shared history. */
  danger?: string;
  tags?: string;
}

export const PLACEHOLDERS = [
  { key: 'branch', label: 'Branch', example: 'feature/login' },
  { key: 'commit', label: 'Commit', example: 'a1b2c3d' },
  { key: 'file', label: 'File', example: 'src/app.ts' },
  { key: 'remote', label: 'Remote', example: 'origin' },
] as const;

export const SCENARIOS: Scenario[] = [
  { id: 'undo-last-keep', group: 'Undo', question: 'Undo the last commit but keep the changes', commands: ['git reset --soft HEAD~1'], explain: 'The commit disappears and its changes stay staged, ready to commit again.', tags: 'uncommit' },
  { id: 'undo-last-discard', group: 'Undo', question: 'Undo the last commit and throw its changes away', commands: ['git reset --hard HEAD~1'], explain: 'Moves the branch back one commit and resets your files to match.', danger: 'The changes are gone for good (except via git reflog for a while). Do not use it on commits you already pushed.' },
  { id: 'amend', group: 'Undo', question: 'Fix the last commit message or add a forgotten file', commands: ['git add {file}', 'git commit --amend'], explain: 'Replaces the last commit with a new one that includes the staged changes; your editor opens for the message. Add --no-edit to keep the message.', danger: 'If the commit was pushed, you must force push (git push --force-with-lease), which affects others.' },
  { id: 'revert', group: 'Undo', question: 'Undo a commit that was already pushed', commands: ['git revert {commit}', 'git push'], explain: 'Creates a new commit that does the opposite, so history stays intact for everyone.', tags: 'shared main' },
  { id: 'discard-file', group: 'Undo', question: 'Throw away local changes in one file', commands: ['git restore {file}'], explain: 'Puts the file back to how it was in the last commit.', danger: 'Uncommitted changes in that file are lost.' },
  { id: 'discard-all', group: 'Undo', question: 'Throw away all local changes', commands: ['git restore .', 'git clean -fd'], explain: 'restore undoes changes to tracked files; clean -fd deletes new files and folders. Run git clean -nd first to see what would be deleted.', danger: 'All uncommitted work is lost.' },
  { id: 'unstage', group: 'Undo', question: 'Unstage a file (undo git add)', commands: ['git restore --staged {file}'], explain: 'The file stays changed but is no longer in the next commit.' },
  { id: 'recover', group: 'Undo', question: 'Get back a commit or branch I lost after a reset or delete', commands: ['git reflog', 'git branch recovered {commit}'], explain: 'reflog lists everywhere HEAD has been, including “lost” commits. Pick the hash and make a branch at it.', tags: 'lost deleted' },

  { id: 'new-branch', group: 'Branches', question: 'Create a branch and switch to it', commands: ['git switch -c {branch}'], explain: 'Same as git checkout -b in older Git.' },
  { id: 'switch', group: 'Branches', question: 'Switch to another branch', commands: ['git switch {branch}'], explain: 'If the branch only exists on the remote, Git creates a local one that tracks it.' },
  { id: 'rename-branch', group: 'Branches', question: 'Rename the current branch', commands: ['git branch -m {branch}'], explain: 'Renames it locally. If it was pushed: push the new name and delete the old one on the remote.' },
  { id: 'delete-branch', group: 'Branches', question: 'Delete a branch locally and on the remote', commands: ['git branch -d {branch}', 'git push {remote} --delete {branch}'], explain: '-d refuses if the branch is not merged; use -D to force.' },
  { id: 'wrong-branch', group: 'Branches', question: 'I committed to the wrong branch (for example main)', commands: ['git branch {branch}', 'git reset --hard HEAD~1', 'git switch {branch}'], explain: 'Makes a branch that keeps the commit, moves the current branch back, then switches to the new branch.', danger: 'Only if the commit was not pushed yet. Commit or stash other changes first.' },
  { id: 'cherry-pick', group: 'Branches', question: 'Copy one commit from another branch', commands: ['git cherry-pick {commit}'], explain: 'Applies the changes of that commit on top of the current branch as a new commit.' },
  { id: 'merge', group: 'Branches', question: 'Bring another branch into mine (merge)', commands: ['git switch {branch}', 'git merge main'], explain: 'Adds a merge commit that joins the histories. Use git merge --no-ff to always keep a merge commit.' },
  { id: 'rebase', group: 'Branches', question: 'Update my branch with the latest main (rebase)', commands: ['git fetch {remote}', 'git rebase {remote}/main'], explain: 'Replays your commits on top of the latest main for a straight history. If a conflict appears, fix it, git add, then git rebase --continue.', danger: 'Rewrites your branch: if it was already pushed, you will need git push --force-with-lease.' },
  { id: 'abort', group: 'Branches', question: 'Cancel a merge or rebase that went wrong', commands: ['git merge --abort', 'git rebase --abort'], explain: 'Puts everything back to how it was before you started. Use the one that matches what you were doing.', tags: 'conflict' },
  { id: 'squash', group: 'Branches', question: 'Squash my last commits into one', commands: ['git reset --soft HEAD~3', 'git commit -m "One clear message"'], explain: 'Replace 3 with the number of commits. The changes of all of them become one commit.', danger: 'Rewrites history: force push needed if already pushed.' },

  { id: 'push-new', group: 'Remote', question: 'Push a new branch for the first time', commands: ['git push -u {remote} {branch}'], explain: '-u remembers the remote branch, so later just git push and git pull work.' },
  { id: 'force-safe', group: 'Remote', question: 'Push after rewriting history, safely', commands: ['git push --force-with-lease'], explain: 'Like --force, but refuses if someone else pushed in the meantime, so you do not overwrite their work.' },
  { id: 'pull-rebase', group: 'Remote', question: 'Pull without creating merge commits', commands: ['git pull --rebase', 'git config --global pull.rebase true'], explain: 'The second command makes it the default.' },
  { id: 'sync-fork', group: 'Remote', question: 'Update my fork with the original repository', commands: ['git remote add upstream <original-repo-url>', 'git fetch upstream', 'git rebase upstream/main', 'git push --force-with-lease'], explain: 'Add the original as “upstream” once, then fetch and rebase whenever you want the latest changes.' },
  { id: 'change-remote', group: 'Remote', question: 'Change the remote URL (for example HTTPS to SSH)', commands: ['git remote set-url {remote} git@github.com:user/repo.git', 'git remote -v'], explain: 'The last command shows the remotes to check.' },
  { id: 'clean-remote-branches', group: 'Remote', question: 'Remove local references to deleted remote branches', commands: ['git fetch --prune'], explain: 'Branches deleted on the server disappear from git branch -r.' },

  { id: 'stash', group: 'Stash', question: 'Put my changes aside for a moment', commands: ['git stash push -m "work in progress"', 'git stash pop'], explain: 'stash push saves and clears your changes; stash pop brings them back. Add -u to include new files.' },
  { id: 'stash-list', group: 'Stash', question: 'See and use older stashes', commands: ['git stash list', 'git stash apply stash@{1}'], explain: 'apply keeps the stash; pop removes it after applying.' },

  { id: 'log', group: 'History', question: 'See a short, readable history', commands: ['git log --oneline --graph --decorate --all'], explain: 'One line per commit with branches drawn as a graph.' },
  { id: 'file-history', group: 'History', question: 'See who changed each line of a file', commands: ['git blame {file}', 'git log -p -- {file}'], explain: 'blame shows the last commit for each line; log -p shows every change to the file.' },
  { id: 'find-commit', group: 'History', question: 'Find the commit that broke something', commands: ['git bisect start', 'git bisect bad', 'git bisect good {commit}'], explain: 'Git checks out commits in between; mark each git bisect good or bad until it names the culprit, then git bisect reset.' },
  { id: 'search-code', group: 'History', question: 'Find when some text was added or removed', commands: ['git log -S "functionName" --oneline'], explain: 'Lists commits where the number of times the text appears changed.' },
  { id: 'diff-branches', group: 'History', question: 'Compare two branches', commands: ['git diff main..{branch}', 'git log main..{branch} --oneline'], explain: 'diff shows the changes; log shows the commits on {branch} that are not on main.' },

  { id: 'untrack', group: 'Fix mistakes', question: 'Stop tracking a file but keep it (after adding it to .gitignore)', commands: ['git rm --cached {file}', 'git commit -m "Stop tracking {file}"'], explain: 'The file stays on disk and is ignored from now on. Use -r for a folder.', tags: 'gitignore' },
  { id: 'secret', group: 'Fix mistakes', question: 'I committed a password or API key', commands: ['git rm --cached {file}', 'git commit --amend'], explain: 'This removes it from the last commit. If it was pushed, rotate the secret immediately: it must be treated as leaked. Tools like git filter-repo can purge it from all history.', danger: 'Changing history is not enough once pushed; always rotate the key.' },
  { id: 'line-endings', group: 'Fix mistakes', question: 'Every line shows as changed (line endings)', commands: ['git config --global core.autocrlf input', 'git add --renormalize .'], explain: 'Use input on macOS and Linux, true on Windows. A .gitattributes file with * text=auto fixes it for the whole team.' },
  { id: 'identity', group: 'Fix mistakes', question: 'Set my name and email for commits', commands: ['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"'], explain: 'Leave out --global to set them for this repository only.' },
  { id: 'large-file', group: 'Fix mistakes', question: 'Push is rejected because a file is too large', commands: ['git lfs install', 'git lfs track "*.psd"', 'git add .gitattributes'], explain: 'Git LFS stores big files outside the repository. Files already committed must be removed from history first.' },
];

export function fill(command: string, values: Record<string, string>): string {
  return command.replace(/\{(branch|commit|file|remote)\}/g, (m, key: string) => values[key]?.trim() || m);
}

export function searchScenarios(query: string): Scenario[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SCENARIOS.filter((s) => words.every((w) => `${s.question} ${s.explain} ${s.commands.join(' ')} ${s.tags ?? ''} ${s.group}`.toLowerCase().includes(w)));
}
