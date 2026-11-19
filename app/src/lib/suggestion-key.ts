/** ⌘↵ on an empty message box sends the prompt the agent suggests (Claude Code's faint one): the message box
 *  in front says whether it can (`setSuggestionTaker`), so Live's ⌘↵, which comes first, asks it too. */
let taker: (() => boolean) | null = null

export function setSuggestionTaker(take: (() => boolean) | null) {
  taker = take
}

/** Sends the suggestion if the box in front is empty and one shows. True when it did. */
export function takeSuggestion(): boolean {
  return taker?.() ?? false
}
