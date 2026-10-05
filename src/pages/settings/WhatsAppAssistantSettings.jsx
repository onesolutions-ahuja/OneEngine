import { useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { apiRequest } from '../../services/api'

export default function WhatsAppAssistantSettings() {
  const [enabled, setEnabled] = useState(false)
  const [configuration, setConfiguration] = useState({})
  const [secrets, setSecrets] = useState({ accessToken: '', webhookVerifyToken: '', appSecret: '' })
  const [testToken, setTestToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiRequest('/api/integrations')
      const connection = (response?.data || []).find((row) => String(row.providerName || row.provider_name || '').toLowerCase() === 'whatsapp')
      const responseData = connection ? { data: { enabled: connection.enabled === true, configuration: { connection_id: connection.id, phone_number_id: connection.connectorConfiguration?.phoneNumberId || connection.connector_configuration?.phoneNumberId || '', business_account_id: connection.connectorConfiguration?.businessAccountId || connection.connector_configuration?.businessAccountId || '', default_country_code: connection.connectorConfiguration?.defaultCountryCode || connection.connector_configuration?.defaultCountryCode || '', access_token_configured: connection.hasCredentials === true } } } : { data: {} }
      const data = responseData?.data || {}
      setEnabled(data.enabled === true)
      setConfiguration(data.configuration || {})
    } catch (err) {
      setError(err?.message || 'Unable to load WhatsApp settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const payload = () => ({
    enabled,
    phoneNumberId: configuration.phone_number_id || '',
    businessAccountId: configuration.business_account_id || '',
    displayName: configuration.display_name || '',
    defaultCountryCode: configuration.default_country_code || '+44',
    invoiceMessageTemplate: configuration.invoice_message_template || '',
    deliveryMode: configuration.delivery_mode || 'link',
    autoSendEnabled: configuration.auto_send_enabled === true,
    assistantMode: configuration.assistant_mode || 'RULES',
    customerMatchMode: configuration.customer_match_mode || 'PHONE',
    createCustomerIfMissing: configuration.create_customer_if_missing === true,
    allowedIntents: configuration.allowed_intents || '',
    humanHandoffEnabled: configuration.human_handoff_enabled !== false,
    aiProvider: configuration.ai_provider || '',
    privacyScope: configuration.privacy_scope || '',
    optOutEnabled: configuration.opt_out_enabled !== false,
    ...(secrets.accessToken ? { accessToken: secrets.accessToken } : {}),
    ...(secrets.webhookVerifyToken ? { webhookVerifyToken: secrets.webhookVerifyToken } : {}),
    ...(secrets.appSecret ? { appSecret: secrets.appSecret } : {}),
    ...(testToken ? { testToken } : {}),
  })

  const testConnection = async () => {
    try {
      setTesting(true)
      setError('')
      setMessage('')
      if (!configuration.connection_id) throw new Error('Save the WhatsApp connection before testing it.')
      const response = await apiRequest(`/api/integrations/${encodeURIComponent(configuration.connection_id)}/test-connection`, { method: 'POST' })
      if (response?.success === false) {
        throw new Error(response?.data?.error || response?.message || 'Connection test failed.')
      }
      setTestToken(response?.data?.testToken || '')
      const verified = response?.data?.verifiedName || response?.data?.verified_name
      setMessage(verified ? `Connected to ${verified}.` : 'WhatsApp connection successful.')
    } catch (err) {
      setError(err?.message || 'WhatsApp connection test failed.')
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const response = await apiRequest('/api/whatsapp/settings', {
        method: 'PUT',
        body: JSON.stringify(payload()),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to save WhatsApp settings.')
      setMessage(response?.message || 'WhatsApp settings saved.')
      setSecrets({ accessToken: '', webhookVerifyToken: '', appSecret: '' })
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save WhatsApp settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="delivery-settings-state">Loading WhatsApp Assistant settings…</div>

  const field = (key, title, help, placeholder = '') => (
    <div className="settings-row" key={key}>
      <div><strong>{title}</strong><p>{help}</p></div>
      <input
        value={configuration[key] ?? ''}
        placeholder={placeholder}
        onChange={(event) => setConfiguration((value) => ({ ...value, [key]: event.target.value }))}
      />
    </div>
  )

  return <div className="delivery-settings">
    {error ? <div className="settings-alert settings-alert--error">{error}</div> : null}
    {message ? <div className="settings-alert settings-alert--success">{message}</div> : null}

    <div className="settings-row">
      <div><strong>WhatsApp Assistant</strong><p>Configure the company WhatsApp Business connection and assistant behaviour.</p></div>
      <button type="button" className={`mac-switch ${enabled ? 'is-on' : ''}`} onClick={() => setEnabled((value) => !value)} aria-label="Enable WhatsApp Assistant"><span /></button>
    </div>

    {field('phone_number_id', 'Phone Number ID', 'Numeric Phone Number ID from the Meta developer dashboard.')}
    {field('business_account_id', 'Business Account ID', 'WhatsApp Business Account ID from Meta.')}
    {field('display_name', 'Display name', 'Friendly name shown for this WhatsApp connection.')}
    {field('default_country_code', 'Default country code', 'Applied to numbers without an international prefix.', '+44')}

    <div className="settings-row">
      <div><strong>Access token</strong><p>{configuration.access_token_configured ? `Configured ${configuration.access_token_masked || ''}` : 'Meta WhatsApp Cloud API access token.'}</p></div>
      <input type="password" value={secrets.accessToken} placeholder={configuration.access_token_configured ? 'Leave blank to keep existing' : 'Access token'} onChange={(event) => setSecrets((value) => ({ ...value, accessToken: event.target.value }))} />
    </div>

    <div className="settings-row">
      <div><strong>Webhook verify token</strong><p>{configuration.webhook_verify_token_configured ? `Configured ${configuration.webhook_verify_token_masked || ''}` : 'Token used to verify the Meta webhook.'}</p></div>
      <input type="password" value={secrets.webhookVerifyToken} placeholder={configuration.webhook_verify_token_configured ? 'Leave blank to keep existing' : 'Webhook verify token'} onChange={(event) => setSecrets((value) => ({ ...value, webhookVerifyToken: event.target.value }))} />
    </div>

    <div className="settings-row">
      <div><strong>App secret</strong><p>{configuration.app_secret_configured ? `Configured ${configuration.app_secret_masked || ''}` : 'Meta app secret used to verify webhook signatures.'}</p></div>
      <input type="password" value={secrets.appSecret} placeholder={configuration.app_secret_configured ? 'Leave blank to keep existing' : 'App secret'} onChange={(event) => setSecrets((value) => ({ ...value, appSecret: event.target.value }))} />
    </div>

    <div className="settings-row">
      <div><strong>Assistant mode</strong><p>Select the response mode used for inbound WhatsApp conversations.</p></div>
      <select value={configuration.assistant_mode || 'RULES'} onChange={(event) => setConfiguration((value) => ({ ...value, assistant_mode: event.target.value }))}>
        <option value="RULES">Rules</option>
        <option value="AI">AI</option>
        <option value="HYBRID">Hybrid</option>
      </select>
    </div>

    <div className="settings-row">
      <div><strong>Customer matching</strong><p>How inbound numbers are matched to customer records.</p></div>
      <select value={configuration.customer_match_mode || 'PHONE'} onChange={(event) => setConfiguration((value) => ({ ...value, customer_match_mode: event.target.value }))}>
        <option value="PHONE">Phone</option>
        <option value="PHONE_OR_CREATE">Phone or create</option>
      </select>
    </div>

    <div className="settings-row">
      <div><strong>Create missing customer</strong><p>Create a customer when an inbound WhatsApp number has no match.</p></div>
      <button type="button" className={`mac-switch ${configuration.create_customer_if_missing ? 'is-on' : ''}`} onClick={() => setConfiguration((value) => ({ ...value, create_customer_if_missing: !value.create_customer_if_missing }))}><span /></button>
    </div>

    <div className="settings-row">
      <div><strong>Human handoff</strong><p>Allow conversations to be handed to a person.</p></div>
      <button type="button" className={`mac-switch ${configuration.human_handoff_enabled !== false ? 'is-on' : ''}`} onClick={() => setConfiguration((value) => ({ ...value, human_handoff_enabled: value.human_handoff_enabled === false }))}><span /></button>
    </div>

    <div className="settings-row">
      <div><strong>Opt-out handling</strong><p>Respect supported WhatsApp opt-out keywords.</p></div>
      <button type="button" className={`mac-switch ${configuration.opt_out_enabled !== false ? 'is-on' : ''}`} onClick={() => setConfiguration((value) => ({ ...value, opt_out_enabled: value.opt_out_enabled === false }))}><span /></button>
    </div>

    <div className="delivery-settings-actions">
      <button type="button" className="settings-secondary-button" disabled={testing || saving} onClick={testConnection}><RefreshCw size={14} />{testing ? 'Testing…' : 'Test connection'}</button>
      <button type="button" className="module-primary-button" disabled={saving || testing} onClick={save}><Save size={14} />{saving ? 'Saving…' : 'Save'}</button>
    </div>
  </div>
}
