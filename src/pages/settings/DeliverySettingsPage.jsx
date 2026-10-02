import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send, Save } from 'lucide-react'
import { apiRequest } from '../../services/api'

const CHANNEL_FIELDS = {
  sms: [
    ['sms_provider','Provider','generic_http'],
    ['sender_id','Sender ID','OnePOS'],
    ['api_base_url','API endpoint','https://'],
    ['default_country_code','Default country code','+44'],
    ['message_template','Message template','Your receipt: {link}'],
  ],
  email: [
    ['email_provider','Provider','smtp'],
    ['from_address','From address','receipts@example.com'],
    ['from_name','From name','onePOS'],
    ['smtp_host','SMTP host','smtp.example.com'],
    ['smtp_port','SMTP port','587'],
    ['smtp_secure','SMTP secure','true'],
    ['api_base_url','API endpoint','https://'],
    ['subject_template','Subject template','Your receipt'],
    ['message_template','Message template','Your receipt: {link}'],
  ],
}

export default function DeliverySettingsPage({ channel = 'email' }) {
  const label = channel === 'sms' ? 'SMS' : 'Email'
  const [enabled,setEnabled]=useState(false)
  const [configuration,setConfiguration]=useState({})
  const [secrets,setSecrets]=useState({ apiKey:'', apiSecret:'', authToken:'' })
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [testing,setTesting]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [testToken,setTestToken]=useState('')
  const [testRecipient,setTestRecipient]=useState('')
  const [testSaleId,setTestSaleId]=useState('')
  const [testSending,setTestSending]=useState(false)

  const fields=useMemo(()=>CHANNEL_FIELDS[channel]||[],[channel])

  const load=async()=>{
    try{
      setLoading(true);setError('');setMessage('')
      const response=await apiRequest(`/api/invoice-delivery/${channel}/settings`)
      const data=response?.data||{}
      setEnabled(data.enabled===true)
      setConfiguration(data.configuration||{})
    }catch(err){setError(err?.message||`Unable to load ${label} settings.`)}
    finally{setLoading(false)}
  }

  useEffect(()=>{ void load() },[channel])

  const payload=()=>({
    enabled,
    autoSendEnabled:configuration.auto_send_enabled===true,
    ...Object.fromEntries(fields.map(([key])=>[key,configuration[key]??''])),
    ...(secrets.apiKey?{apiKey:secrets.apiKey}:{}),
    ...(secrets.apiSecret?{apiSecret:secrets.apiSecret}:{}),
    ...(secrets.authToken?{authToken:secrets.authToken}:{}),
    ...(testToken?{testToken}:{}),
  })

  const save=async()=>{
    try{
      setSaving(true);setError('');setMessage('')
      const response=await apiRequest(`/api/invoice-delivery/${channel}/settings`,{method:'PUT',body:JSON.stringify(payload())})
      setMessage(response?.message||`${label} settings saved.`)
      const data=response?.data||{}
      setEnabled(data.enabled===true)
      setConfiguration(data.configuration||configuration)
      setSecrets({apiKey:'',apiSecret:'',authToken:''})
    }catch(err){setError(err?.message||`Unable to save ${label} settings.`)}
    finally{setSaving(false)}
  }

  const test=async()=>{
    try{
      setTesting(true);setError('');setMessage('')
      const response=await apiRequest(`/api/invoice-delivery/${channel}/test-connection`,{method:'POST',body:JSON.stringify(payload())})
      if(response?.success===false) throw new Error(response?.data?.error||response?.message||'Connection test failed.')
      const token=response?.data?.testToken||''
      setTestToken(token)
      setMessage(response?.message||'Connection successful.')
    }catch(err){setError(err?.message||'Connection test failed.')}
    finally{setTesting(false)}
  }

  const sendTest=async()=>{
    try{
      setTestSending(true);setError('');setMessage('')
      const response=await apiRequest(`/api/invoice-delivery/${channel}/test-send`,{
        method:'POST',
        body:JSON.stringify({saleId:testSaleId.trim(),recipient:testRecipient.trim()})
      })
      if(response?.success===false) throw new Error(response?.message||'Test send failed.')
      setMessage(response?.message||`${label} test sent successfully.`)
    }catch(err){setError(err?.message||'Test send failed.')}
    finally{setTestSending(false)}
  }

  if(loading) return <div className="delivery-settings-state">Loading {label} delivery settings…</div>

  return <div className="delivery-settings">
    {error?<div className="settings-alert settings-alert--error">{error}</div>:null}
    {message?<div className="settings-alert settings-alert--success">{message}</div>:null}

    <div className="settings-row">
      <div><strong>{label} delivery</strong><p>Configure invoice and receipt delivery for this company.</p></div>
      <button type="button" className={`mac-switch ${enabled?'is-on':''}`} onClick={()=>setEnabled(v=>!v)} aria-label={`Enable ${label} delivery`}><span/></button>
    </div>

    {channel==='email'?<div className="settings-alert">
      <strong>Sender domain guidance</strong>
      <div>For a professional From address, verify the sender and authenticate a domain you own with your email provider. Free mailbox domains such as Gmail, Yahoo or Outlook may be rewritten or have lower deliverability depending on the provider.</div>
    </div>:null}

    {fields.map(([key,title,placeholder])=><div className="settings-row" key={key}>
      <div><strong>{title}</strong><p>{fieldHelp(key)}</p></div>
      <input value={configuration[key]??''} placeholder={placeholder} onChange={e=>setConfiguration(v=>({...v,[key]:e.target.value}))}/>
    </div>)}

    <div className="settings-row">
      <div><strong>API key</strong><p>{configuration.api_key_configured?`Configured ${configuration.api_key_masked||''}`:'Optional provider API key.'}</p></div>
      <input type="password" value={secrets.apiKey} placeholder={configuration.api_key_configured?'Leave blank to keep existing':'API key'} onChange={e=>setSecrets(v=>({...v,apiKey:e.target.value}))}/>
    </div>
    <div className="settings-row">
      <div><strong>Auth token</strong><p>{configuration.auth_token_configured?`Configured ${configuration.auth_token_masked||''}`:'Optional bearer/authentication token.'}</p></div>
      <input type="password" value={secrets.authToken} placeholder={configuration.auth_token_configured?'Leave blank to keep existing':'Auth token'} onChange={e=>setSecrets(v=>({...v,authToken:e.target.value}))}/>
    </div>
    <div className="settings-row">
      <div><strong>Auto send</strong><p>Automatically send after a completed sale when a recipient is available.</p></div>
      <button type="button" className={`mac-switch ${configuration.auto_send_enabled?'is-on':''}`} onClick={()=>setConfiguration(v=>({...v,auto_send_enabled:!v.auto_send_enabled}))}><span/></button>
    </div>

    {channel==='email'?<>
      <div className="settings-row">
        <div><strong>Test recipient email</strong><p>Send a real test using the configured email delivery provider.</p></div>
        <input type="email" value={testRecipient} placeholder="name@example.com" onChange={e=>setTestRecipient(e.target.value)}/>
      </div>
      <div className="settings-row">
        <div><strong>Test sale ID</strong><p>The generic Email Connector sends the real invoice template, so choose a sale from this company for the test.</p></div>
        <input value={testSaleId} placeholder="Sale ID" onChange={e=>setTestSaleId(e.target.value)}/>
      </div>
    </>:null}

    <div className="delivery-settings-actions">
      <button type="button" className="settings-secondary-button" disabled={testing||saving||testSending} onClick={test}><RefreshCw size={14}/>{testing?'Testing…':'Test connection'}</button>
      {channel==='email'?<button type="button" className="settings-secondary-button" disabled={testSending||!testRecipient.trim()||!testSaleId.trim()} onClick={sendTest}><Send size={14}/>{testSending?'Sending…':'Send test email'}</button>:null}
      <button type="button" className="module-primary-button" disabled={saving||testing||testSending} onClick={save}><Save size={14}/>{saving?'Saving…':'Save'}</button>
    </div>
  </div>
}


function fieldHelp(key){
  const help={
    sms_provider:'Provider identifier such as generic HTTP, Twilio or MessageBird.',
    sender_id:'Name or number shown to recipients.',
    api_base_url:'HTTPS provider endpoint used for delivery.',
    default_country_code:'Applied when a phone number has no country prefix.',
    message_template:'Use {link} where the secure receipt/invoice link should appear.',
    email_provider:'Provider identifier such as SMTP or HTTP API. Sender verification and domain authentication are managed by the provider you choose.',
    from_address:'Email address customers receive messages from. Verify this sender with your chosen provider. For branded sending and better deliverability, authenticate a domain you own and use an address on that domain.',
    from_name:'Display name shown in the customer inbox.',
    smtp_host:'SMTP server hostname.',
    smtp_port:'SMTP server port.',
    smtp_secure:'Use true when the provider requires a secure SMTP connection.',
    subject_template:'Subject used for delivered receipts and invoices.',
  }
  return help[key]||'Delivery provider setting.'
}
