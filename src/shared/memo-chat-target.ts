/** A conservative exclusion from repository Note write authority, never a
 * grant of authority. Mixed Note/memo requests must separate their writes. */
export function mentionsMemoWorkspace(text: string): boolean {
  return /备忘录|星座|(?:这颗|当前|这个)星|\bmemos?\b/iu.test(text)
}

export const MEMO_TARGET_PROMPT = `Janus memo (备忘录, left constellation workspace) and repository Note documents are separate destinations. A request to create/update a milestone memo belongs to memo_create/memo_read/memo_edit, never note_write or filesystem/shell writes. Repository Notes may be read as references. If memo tools are unavailable, explain that and ask the user to select/create a memo in the left workspace; never substitute a repository Note. For a request mentioning both destinations, clarify/separate the Note write instead of treating memo instructions as Note authorization.`
