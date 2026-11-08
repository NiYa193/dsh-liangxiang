/**
 * Version-scoped release notes shown once per browser after every upgrade.
 *
 * Keep the literal version independent from `PLUGIN_VERSION`: the manifest
 * test deliberately fails when a version bump forgets to refresh this copy.
 * This is cosmetic localStorage only and never participates in authority.
 */
export const RELEASE_NOTES_VERSION = '1.2.1-compat.1'
export const RELEASE_NOTES_TITLE = `梁相 v${RELEASE_NOTES_VERSION} 更新`
export const RELEASE_NOTES_ITEMS = [
  '版本提示更清楚：身份已启用在线钱包时，明确提示升级至梁相2.0.0及以上版本。',
  '上香先守住：版本不兼容时暂停操作，避免旧界面误解钱包状态。',
  '原身份接着用：升级到2.0后，继续访问同一身份的香火与梁股。',
] as const
export const RELEASE_NOTES_QQ = '梁相 QQ 群：453683905'
export const RELEASE_NOTES_QQ_INVITE = '来群里一起出梁案、晒梁位、催更新，第一批梁友等你入席。'
export const RELEASE_NOTES_THANKS = '鸣谢 @XChen446、@Ritanlisa、@xunxiaoQ，以及每位社区贡献者。'

const RELEASE_NOTES_KEY_PREFIX = 'liangxiang:release-notes:'

export function releaseNotesStorageKey(version = RELEASE_NOTES_VERSION): string {
  return `${RELEASE_NOTES_KEY_PREFIX}${version}`
}

export function hasSeenReleaseNotes(
  version = RELEASE_NOTES_VERSION,
  storage?: Pick<Storage, 'getItem'> | null,
): boolean {
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    return store === null || store.getItem(releaseNotesStorageKey(version)) === 'seen'
  } catch {
    return true
  }
}

export function markReleaseNotesSeen(
  version = RELEASE_NOTES_VERSION,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  try {
    const store = storage === undefined
      ? (typeof localStorage === 'undefined' ? null : localStorage)
      : storage
    store?.setItem(releaseNotesStorageKey(version), 'seen')
  } catch {
    /* Cosmetic acknowledgement must never break the panel. */
  }
}
