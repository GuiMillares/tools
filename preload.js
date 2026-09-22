const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveCreds: (creds) => ipcRenderer.invoke('creds:save', creds),
  loadCreds: () => ipcRenderer.invoke('creds:load'),
  clearCreds: () => ipcRenderer.invoke('creds:clear'),
  fetchPr: (payload) => ipcRenderer.invoke('pr:fetch', payload),
  mergePr: (payload) => ipcRenderer.invoke('pr:merge', payload),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  getMergeHistory: () => ipcRenderer.invoke('history:list'),
  addMergeHistory: (entry) => ipcRenderer.invoke('history:add', entry),
  removeMergeHistory: (id) => ipcRenderer.invoke('history:remove', id),
  clearMergeHistory: () => ipcRenderer.invoke('history:clear'),
  getHubState: () => ipcRenderer.invoke('hubstate:get'),
  setHubState: (state) => ipcRenderer.invoke('hubstate:set', state),
  getGoogleConfig: () => ipcRenderer.invoke('google:getConfig'),
  setGoogleConfig: (config) => ipcRenderer.invoke('google:setConfig', config),
  createGoogleProject: (payload) => ipcRenderer.invoke('google:createProject', payload),
  verifySearchConsole: (payload) => ipcRenderer.invoke('google:verifySearchConsole', payload),
  findExistingGoogle: (payload) => ipcRenderer.invoke('google:findExisting', payload),
  commitGeralPhp: (payload) => ipcRenderer.invoke('bitbucket:commitGeral', payload),
  getOauthConfig: () => ipcRenderer.invoke('oauth:getConfig'),
  setOauthConfig: (config) => ipcRenderer.invoke('oauth:setConfig', config),
  oauthStatus: (payload) => ipcRenderer.invoke('oauth:status', payload),
  brandOauthStatus: () => ipcRenderer.invoke('oauth:brandStatus'),
  oauthLogin: (payload) => ipcRenderer.invoke('oauth:login', payload),
  cancelOauthLogin: () => ipcRenderer.invoke('oauth:cancelLogin'),
  // Devolve uma função pra cancelar a escuta — o link chega depois que o
  // servidor local sobe, então não dá pra ser um invoke comum.
  onOauthUrl: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('oauth:url', handler);
    return () => ipcRenderer.removeListener('oauth:url', handler);
  },
  oauthLogout: (payload) => ipcRenderer.invoke('oauth:logout', payload),
  listBrandAccounts: (payload) => ipcRenderer.invoke('analytics:listBrandAccounts', payload),
  grantAccessBulk: (payload) => ipcRenderer.invoke('analytics:grantAccessBulk', payload),
  getMsConfig: () => ipcRenderer.invoke('ms:getConfig'),
  setMsConfig: (config) => ipcRenderer.invoke('ms:setConfig', config),
  msStatus: () => ipcRenderer.invoke('ms:status'),
  msLogin: () => ipcRenderer.invoke('ms:login'),
  msLogout: () => ipcRenderer.invoke('ms:logout'),
  cancelMsLogin: () => ipcRenderer.invoke('ms:cancelLogin'),
  onMsUrl: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('ms:url', handler);
    return () => ipcRenderer.removeListener('ms:url', handler);
  },
  // Salesforce (ADR-086)
  salesforceGetConfig: () => ipcRenderer.invoke('salesforce:getConfig'),
  salesforceSetConfig: (payload) => ipcRenderer.invoke('salesforce:setConfig', payload),
  salesforceConectar: () => ipcRenderer.invoke('salesforce:conectar'),
  salesforceDesconectar: () => ipcRenderer.invoke('salesforce:desconectar'),
  salesforceDiagnostico: (payload) => ipcRenderer.invoke('salesforce:diagnostico', payload),
  salesforceFecharTarefa: (payload) => ipcRenderer.invoke('salesforce:fecharTarefa', payload),
  onSalesforceUrl: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('salesforce:url', handler);
    return () => ipcRenderer.removeListener('salesforce:url', handler);
  },
  sendMailBatch: (payload) => ipcRenderer.invoke('mail:sendBatch', payload),
  checkDnsBatch: (payload) => ipcRenderer.invoke('dns:checkBatch', payload),
  dnsHistory: (payload) => ipcRenderer.invoke('dns:history', payload),
  dnsHistStatus: () => ipcRenderer.invoke('dnshist:status'),
  setDnsHistKey: (payload) => ipcRenderer.invoke('dnshist:setKey', payload),
  painelStatus: () => ipcRenderer.invoke('painel:status'),
  setPainelCreds: (payload) => ipcRenderer.invoke('painel:setCreds', payload),
  clearPainelSession: () => ipcRenderer.invoke('painel:clearSession'),
  syncPainel: (payload) => ipcRenderer.invoke('painel:sync', payload),
  lerPlanilha: (payload) => ipcRenderer.invoke('planilha:ler', payload),
  // Publicação MPI+ de ponta a ponta (ADR-058)
  getPublicacaoConfig: () => ipcRenderer.invoke('publicacao:getConfig'),
  setPublicacaoConfig: (payload) => ipcRenderer.invoke('publicacao:setConfig', payload),
  clearEmpresa: (payload) => ipcRenderer.invoke('publicacao:clearEmpresa', payload),
  fotografarDns: (payload) => ipcRenderer.invoke('dns:fotografar', payload),
  conferirNs: (payload) => ipcRenderer.invoke('dns:conferirNs', payload),
  conferirApontamento: (payload) => ipcRenderer.invoke('dns:apontando', payload),
  verificarCloudflare: (payload) => ipcRenderer.invoke('cloudflare:verificar', payload),
  montarZonaCloudflare: (payload) => ipcRenderer.invoke('cloudflare:montarZona', payload),
  aplicarCloudflare: (payload) => ipcRenderer.invoke('cloudflare:aplicar', payload),
  exportarPlanilha: (payload) => ipcRenderer.invoke('planilha:exportar', payload),
  publicarPainel: (payload) => ipcRenderer.invoke('painel:publicar', payload),
  registrobrTrocarNs: (payload) => ipcRenderer.invoke('registrobr:trocarNs', payload),
  registrobrConsultar: (payload) => ipcRenderer.invoke('registrobr:consultar', payload),
  registrarPlanilha: (payload) => ipcRenderer.invoke('planilha:registrar', payload),
  prepareSearchConsole: (payload) => ipcRenderer.invoke('searchconsole:prepare', payload),
  listGtmBrandAccounts: (payload) => ipcRenderer.invoke('tagmanager:listBrandAccounts', payload),
  grantGtmAccessBulk: (payload) => ipcRenderer.invoke('tagmanager:grantAccessBulk', payload),
});
