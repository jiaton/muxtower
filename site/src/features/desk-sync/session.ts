/** The one session both panes show: a release cut from the Claude desktop app, waiting to run a command. */
export const DESK = {
  name: 'Release notes 2.4',
  asked: 'Notes look good. Tag it and publish the release.',
  reply: 'Tagged v2.4.0. Publishing the GitHub release with these notes needs your OK.',
  tool: 'Bash',
  command: 'gh release create v2.4.0 --notes-file NOTES.md',
  option: 'Yes',
  caption: 'One session: answered on the phone, shown answered at the desk.',
  answered: 'Bash: gh release create v2.4.0 · allowed',
}
