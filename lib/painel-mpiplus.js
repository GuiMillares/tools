// Bloqueio de contatos no painel MPI+ (idealplus) — lógica pura (ADR-121).
//
// Diferente do /doutor (form PHP), o painel MPI+ é Alpine.js: os contatos ficam
// num estado reativo e o "Sincronizar" chama saveSection('settings') (endereços,
// redes, telefones, e-mails) e saveBlock('integrations','whatsapp'). A automação
// edita esse estado e chama as PRÓPRIAS funções de salvar do painel.
//
// Aqui fica só o que é puro e testável: a partir do estado lido da página
// ({addresses, whatsapp}), montar o estado CENSURADO respeitando as validações
// do painel. Regras (validadas com o Guilherme e contra o modelo real da página):
//   - Telefones e WhatsApp NÃO aceitam "##": o painel exige dígitos (endereço ≥1,
//     whatsapp ≥10). Então telefone/whatsapp viram um placeholder neutro.
//   - E-mail vira o e-mail da marca (para MPI+, contato@idealtrends.com.br).
//   - Redes sociais e endereço (texto) viram "##".
//   - CEP/cidade/UF: modo 'A' censura com "##" (o painel valida só "não vazio");
//     modo 'B' mantém CEP/cidade/UF reais e censura só a rua (fallback se o
//     servidor recusar CEP inválido).
//   - Nome (label) do endereço e do número de WhatsApp são obrigatórios e não são
//     contato: ficam como estão.
//
// O backup do desbloqueio é o próprio {addresses, whatsapp} original em JSON:
// restaurar é escrever de volta e salvar. Por isso não há função de "restaurar"
// aqui — o handler reescreve o backup verbatim.

(function () {
  'use strict';

  const CENSURA = '##';
  const TEL_PLACEHOLDER = '(00) 00000-0000'; // 10 dígitos: passa nas validações
  const EMAIL_MPIPLUS = 'contato@idealtrends.com.br';

  function clone(x) { return JSON.parse(JSON.stringify(x === undefined ? null : x)); }
  function temTexto(v) { return String(v == null ? '' : v).trim() !== ''; }
  function digitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  // Censura um endereço (cópia). Não cria dado onde não havia: só censura campos
  // que já vinham preenchidos (menos telefone/e-mail, que o painel exige).
  function censurarEndereco(addr, opts) {
    const a = clone(addr) || {};
    (a.phones || []).forEach((p) => { if (p) p.numero = opts.tel; });
    (a.emails || []).forEach((e) => { if (e) e.email = opts.emailMarca; });
    ['facebook', 'instagram', 'linkedin'].forEach((k) => { if (temTexto(a[k])) a[k] = opts.censura; });
    ['logradouro', 'numero', 'complemento', 'bairro'].forEach((k) => { if (temTexto(a[k])) a[k] = opts.censura; });
    if (opts.modoEndereco === 'A') {
      ['cep', 'cidade', 'uf'].forEach((k) => { if (temTexto(a[k])) a[k] = opts.censura; });
    }
    return a;
  }

  // Monta o estado censurado a partir do estado lido ({addresses, whatsapp}).
  function planoCensura(dados, opcoes) {
    const opts = Object.assign(
      { censura: CENSURA, tel: TEL_PLACEHOLDER, emailMarca: EMAIL_MPIPLUS, modoEndereco: 'A' },
      opcoes || {}
    );
    if (!temTexto(opts.emailMarca)) throw new Error('planoCensura: e-mail da marca não informado');
    const addresses = (dados && dados.addresses ? dados.addresses : []).map((a) => censurarEndereco(a, opts));
    const whatsapp = clone((dados && dados.whatsapp) || { numbers: [] });
    (whatsapp.numbers || []).forEach((w) => {
      if (!w) return;
      w.number = opts.tel;
      if (temTexto(w.whatsapp_message)) w.whatsapp_message = opts.censura;
    });
    return { addresses, whatsapp };
  }

  // Já está bloqueado? Heurística por endereço: todo e-mail == e-mail da marca E
  // todo telefone == placeholder (mesmos dígitos). Evita re-bloquear e permite o
  // desbloqueio saber que há o que reverter.
  function estaBloqueado(dados, opcoes) {
    const opts = Object.assign({ tel: TEL_PLACEHOLDER, emailMarca: EMAIL_MPIPLUS }, opcoes || {});
    const addrs = (dados && dados.addresses) || [];
    if (!addrs.length) return false;
    const telDig = digitos(opts.tel);
    const marca = String(opts.emailMarca || '').trim().toLowerCase();
    return addrs.every((a) => {
      const emails = (a.emails || []);
      const phones = (a.phones || []);
      const emailOk = emails.length > 0 && emails.every((e) => String((e && e.email) || '').trim().toLowerCase() === marca);
      const telOk = phones.length > 0 && phones.every((p) => digitos(p && p.numero) === telDig);
      return emailOk && telOk;
    });
  }

  // O bloco WhatsApp (Integrações) já está censurado? Todo número == placeholder
  // (mesmos dígitos). Sem números cadastrados, conta como censurado (nada a
  // esconder).
  function whatsappBloqueado(dados, opcoes) {
    const opts = Object.assign({ tel: TEL_PLACEHOLDER }, opcoes || {});
    const nums = ((dados && dados.whatsapp) || {}).numbers || [];
    if (!nums.length) return true;
    const telDig = digitos(opts.tel);
    return nums.every((w) => digitos(w && w.number) === telDig);
  }

  // Bloqueio completo = endereços/contatos E WhatsApp censurados. É o que o
  // handler usa para "já estava" e para confirmar. (Salvar os endereços
  // re-hidrata a config do servidor e pode desfazer um WhatsApp censurado só em
  // memória; por isso os dois são checados separadamente.)
  function totalmenteBloqueado(dados, opcoes) {
    return estaBloqueado(dados, opcoes) && whatsappBloqueado(dados, opcoes);
  }

  const _exports = {
    planoCensura, estaBloqueado, whatsappBloqueado, totalmenteBloqueado, censurarEndereco,
    CENSURA, TEL_PLACEHOLDER, EMAIL_MPIPLUS, temTexto, digitos,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
  if (typeof window !== 'undefined') window.PainelMpiplus = _exports;
})();
