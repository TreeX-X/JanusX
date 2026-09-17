import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import {
  validateCcSwitchProfile,
  type CcSwitchProfile,
} from '../../../shared/ipc/cc-switch'
import { ccSwitchService } from '@/services/cc-switch'
import styles from './AppSettingsModal.module.css'

interface ProfileForm {
  name: string
  baseURL: string
  authToken: string
  model: string
}

const EMPTY_FORM: ProfileForm = { name: '', baseURL: '', authToken: '', model: '' }

export function CcSwitchProfiles() {
  const { t } = useI18n('settings')
  const [profiles, setProfiles] = useState<CcSwitchProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [armingRemoveId, setArmingRemoveId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await ccSwitchService.profiles()
    setProfiles(result.profiles)
    setActiveProfileId(result.activeProfileId)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setLoading(false)
    })
  }, [refresh])

  const startCreate = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }, [])

  const startEdit = useCallback((profile: CcSwitchProfile) => {
    setEditingId(profile.id)
    setForm({ name: profile.name, baseURL: profile.baseURL, authToken: profile.authToken, model: profile.model ?? '' })
    setError('')
  }, [])

  const handleSave = useCallback(async () => {
    const failure = validateCcSwitchProfile(form)
    if (failure) {
      setError(t('settings:cliTools.profiles.error.validation'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.saveProfile(editingId ? { ...form, id: editingId } : form)
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      if (result.profiles) {
        setProfiles(result.profiles)
        setActiveProfileId(result.activeProfileId ?? null)
      } else {
        await refresh()
      }
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setBusy(false)
    }
  }, [editingId, form, refresh, t])

  const handleRemove = useCallback(async (profileId: string) => {
    if (armingRemoveId !== profileId) {
      setArmingRemoveId(profileId)
      return
    }
    setArmingRemoveId(null)
    setBusy(true)
    setError('')
    try {
      const result = await ccSwitchService.removeProfile(profileId)
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      if (result.profiles) {
        setProfiles(result.profiles)
        setActiveProfileId(result.activeProfileId ?? null)
      } else {
        await refresh()
      }
      if (editingId === profileId) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : String(removeError))
    } finally {
      setBusy(false)
    }
  }, [armingRemoveId, editingId, refresh])

  const handleActivate = useCallback(async (profileId: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.activateProfile(profileId)
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setActiveProfileId(result.activeProfileId ?? profileId)
      setNotice(t('settings:cliTools.profiles.notice.activated'))
      await refresh()
    } catch (activateError: unknown) {
      setError(activateError instanceof Error ? activateError.message : String(activateError))
    } finally {
      setBusy(false)
    }
  }, [refresh, t])

  const handleRollback = useCallback(async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await ccSwitchService.rollbackProfile()
      if (!result.success) {
        setError(result.error ?? '')
        return
      }
      setNotice(t('settings:cliTools.profiles.notice.rolledBack'))
      await refresh()
    } catch (rollbackError: unknown) {
      setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    } finally {
      setBusy(false)
    }
  }, [refresh, t])

  if (loading) {
    return (
      <div className={styles.lsSection}>
        <div className={styles.lsLoading}>{t('settings:cliTools.loading')}</div>
      </div>
    )
  }

  return (
    <div className={styles.lsSection}>
      <div className={styles.lsCard}>
        <div className={styles.lsCardHeader}>
          <div className={styles.lsCardInfo}>
            <span className={styles.lsCardName}>{t('settings:cliTools.profiles.title')}</span>
            <span className={styles.lsCardDesc}>{t('settings:cliTools.profiles.desc')}</span>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className={styles.lsCardMeta}>
            <span className={styles.lsMetaItem}>{t('settings:cliTools.profiles.list.empty')}</span>
          </div>
        ) : (
          profiles.map((profile) => {
            const isActive = profile.id === activeProfileId
            return (
              <div key={profile.id} className={styles.lsCardMeta}>
                <span className={styles.lsMetaItem}>
                  {profile.name}{isActive ? ` · ${t('settings:cliTools.profiles.list.active')}` : ''}
                </span>
                <span className={styles.lsMetaItem}>{profile.baseURL}</span>
                {profile.model && <span className={styles.lsMetaItem}>{profile.model}</span>}
                <span className={styles.lsCardActions}>
                  {!isActive && (
                    <button
                      type="button"
                      className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
                      disabled={busy}
                      onClick={() => void handleActivate(profile.id)}
                    >
                      {t('settings:cliTools.profiles.list.activate')}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.lsButton} ${styles.lsButtonGhost}`}
                    disabled={busy}
                    onClick={() => startEdit(profile)}
                  >
                    {t('settings:cliTools.profiles.form.edit')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.lsButton} ${styles.lsButtonGhost}`}
                    disabled={busy}
                    onClick={() => void handleRemove(profile.id)}
                  >
                    {armingRemoveId === profile.id
                      ? t('settings:cliTools.profiles.list.confirmRemove')
                      : t('settings:cliTools.profiles.list.remove')}
                  </button>
                </span>
              </div>
            )
          })
        )}

        <div className={styles.lsCardMeta}>
          <span className={styles.lsMetaItem}>{t(editingId ? 'settings:cliTools.profiles.form.editTitle' : 'settings:cliTools.profiles.form.createTitle')}</span>
        </div>
        <div className={styles.lsFormRow}>
          <label className={styles.lsFormGroup}>
            {t('settings:cliTools.profiles.form.name')}
            <input
              className={styles.lsFormInput}
              value={form.name}
              disabled={busy}
              maxLength={64}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className={styles.lsFormGroup}>
            {t('settings:cliTools.profiles.form.baseURL')}
            <input
              className={styles.lsFormInput}
              value={form.baseURL}
              disabled={busy}
              placeholder="https://"
              onChange={(event) => setForm({ ...form, baseURL: event.target.value })}
            />
          </label>
        </div>
        <div className={styles.lsFormRow}>
          <label className={styles.lsFormGroup}>
            {t('settings:cliTools.profiles.form.authToken')}
            <input
              className={styles.lsFormInput}
              type="password"
              value={form.authToken}
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setForm({ ...form, authToken: event.target.value })}
            />
          </label>
          <label className={styles.lsFormGroup}>
            {t('settings:cliTools.profiles.form.model')}
            <input
              className={styles.lsFormInput}
              value={form.model}
              disabled={busy}
              placeholder={t('settings:cliTools.profiles.form.modelPlaceholder')}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            />
          </label>
        </div>

        {notice && <div className={styles.lsCardMeta}><span className={styles.lsMetaItem}>{notice}</span></div>}
        {error && <div className={styles.lsCardError}>{error}</div>}

        <div className={styles.lsCardActions}>
          <button
            type="button"
            className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {t('settings:cliTools.profiles.form.save')}
          </button>
          {(editingId || form.name || form.baseURL || form.authToken || form.model) && (
            <button
              type="button"
              className={`${styles.lsButton} ${styles.lsButtonGhost}`}
              disabled={busy}
              onClick={startCreate}
            >
              {t('settings:cliTools.profiles.form.cancel')}
            </button>
          )}
          <button
            type="button"
            className={`${styles.lsButton} ${styles.lsButtonGhost}`}
            disabled={busy}
            onClick={() => void handleRollback()}
          >
            {t('settings:cliTools.profiles.action.rollback')}
          </button>
          {busy && <span className={styles.lsBusyText}>{t('settings:cliTools.action.working')}</span>}
        </div>
      </div>
    </div>
  )
}
