// ADR-121: bloqueio no painel MPI+ (idealplus). Testa a censura pura contra o
// modelo REAL lido da página (dgosolucoesemesquadrias) e replica as validações
// do painel para garantir que o Sincronizar não vai travar.
//
//     node tools/test-painel-mpiplus.js

const path = require('path');
const P = require(path.join(__dirname, '..', 'lib', 'painel-mpiplus'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Estado real capturado do painel (cliente 2554 / DGO Soluções).
function estadoReal() {
  return {
    addresses: [{
      id: 'a-ga72miqo', seq: 1,
      cep: '11691-400', logradouro: 'Estrada Acrisio Ceschi', numero: '2222',
      complemento: 'galpao2b', bairro: 'Monte Valério', cidade: 'Ubatuba', uf: 'SP',
      facebook: 'https://www.facebook.com/dgosolucoesemesquadrias',
      instagram: 'https://www.instagram.com/dgosolucoesemesquadrias',
      linkedin: '',
      phones: [{ id: 'p-1', numero: '(11) 94062-1897', tipo: 'whatsapp' }],
      emails: [{ email: 'contato@dgosolucoesemesquadrias.com.br', id: 'e-1', principal: true, tipo: 'contato' }],
    }],
    whatsapp: { numbers: [{ label: '.', number: '(11) 94062-1897', whatsapp_message: 'Olá!  Gostaria de conhecer um pouco mais sobre os serviços de vocês.' }] },
  };
}

// --- Réplicas das validações do painel (extraídas do código ao vivo) ---
const dig = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const cheio = (v) => String(v == null ? '' : v).trim() !== '';
function validaGeo(addresses) { // requiredFields não-vazios
  const req = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'];
  for (const a of addresses) { if (!String(a.id || '').trim()) continue; for (const f of req) if (!cheio(a[f])) return `geo vazio: ${f}`; }
  return null;
}
function validaContatos(addresses) { // cada endereço: 1 telefone com dígitos + 1 e-mail
  for (const a of addresses) {
    if (!String(a.id || '').trim()) continue;
    const temTel = (a.phones || []).some((p) => dig(p && p.numero).length > 0);
    const temMail = (a.emails || []).some((e) => cheio(e && e.email));
    if (!temTel) return 'sem telefone preenchido';
    if (!temMail) return 'sem e-mail preenchido';
  }
  return null;
}
function validaWhatsapp(whatsapp) { // label cheio + número ≥10 dígitos
  for (const w of (whatsapp.numbers || [])) {
    if (!cheio(w.label)) return 'whatsapp sem nome';
    if (dig(w.number).length < 10) return 'whatsapp sem telefone (≥10)';
  }
  return null;
}

(async () => {
  console.log('\n=== Censura (modo A: ## em tudo) ===');
  {
    const antes = estadoReal();
    const plano = P.planoCensura(antes, { modoEndereco: 'A' });
    const a = plano.addresses[0];

    check('telefone do endereço vira placeholder (não ##)', a.phones[0].numero === P.TEL_PLACEHOLDER, a.phones[0].numero);
    check('e-mail vira o e-mail da marca', a.emails[0].email === P.EMAIL_MPIPLUS, a.emails[0].email);
    check('facebook/instagram censurados com ##', a.facebook === '##' && a.instagram === '##');
    check('linkedin vazio continua vazio (não cria dado)', a.linkedin === '');
    check('rua/número/complemento/bairro censurados', a.logradouro === '##' && a.numero === '##' && a.complemento === '##' && a.bairro === '##');
    check('cep/cidade/uf censurados no modo A', a.cep === '##' && a.cidade === '##' && a.uf === '##');
    check('ids e tipos preservados (save limpo)', a.id === 'a-ga72miqo' && a.phones[0].id === 'p-1' && a.emails[0].tipo === 'contato');

    const w = plano.whatsapp.numbers[0];
    check('whatsapp: número vira placeholder', w.number === P.TEL_PLACEHOLDER, w.number);
    check('whatsapp: mensagem censurada com ##', w.whatsapp_message === '##');
    check('whatsapp: nome (label) preservado', w.label === '.');

    console.log('\n  -- passa nas validações do painel? --');
    check('validação geo passa', validaGeo(plano.addresses) === null, validaGeo(plano.addresses) || '');
    check('validação de contatos passa', validaContatos(plano.addresses) === null, validaContatos(plano.addresses) || '');
    check('validação do whatsapp passa', validaWhatsapp(plano.whatsapp) === null, validaWhatsapp(plano.whatsapp) || '');

    check('não muta o estado original', estadoReal().addresses[0].phones[0].numero === '(11) 94062-1897');
  }

  console.log('\n=== Censura (modo B: mantém CEP/cidade/UF) ===');
  {
    const plano = P.planoCensura(estadoReal(), { modoEndereco: 'B' });
    const a = plano.addresses[0];
    check('rua/bairro censurados', a.logradouro === '##' && a.bairro === '##');
    check('CEP/cidade/UF mantidos reais', a.cep === '11691-400' && a.cidade === 'Ubatuba' && a.uf === 'SP');
    check('validação geo ainda passa', validaGeo(plano.addresses) === null);
    check('contatos ainda censurados', a.phones[0].numero === P.TEL_PLACEHOLDER && a.emails[0].email === P.EMAIL_MPIPLUS);
  }

  console.log('\n=== estaBloqueado ===');
  {
    check('estado original NÃO está bloqueado', P.estaBloqueado(estadoReal()) === false);
    const plano = P.planoCensura(estadoReal(), { modoEndereco: 'A' });
    check('estado censurado ESTÁ bloqueado', P.estaBloqueado({ addresses: plano.addresses, whatsapp: plano.whatsapp }) === true);
  }

  console.log('\n=== Bloqueio parcial (endereços feitos, WhatsApp não) ===');
  {
    const orig = estadoReal();
    const plano = P.planoCensura(orig, { modoEndereco: 'A' });
    // Cenário real que aconteceu: saveSection re-hidratou a config e o WhatsApp
    // (Integrações) ficou original enquanto os endereços foram censurados.
    const parcial = { addresses: plano.addresses, whatsapp: orig.whatsapp };
    check('endereços censurados → estaBloqueado true', P.estaBloqueado(parcial) === true);
    check('WhatsApp original → whatsappBloqueado false', P.whatsappBloqueado(parcial) === false);
    check('parcial NÃO conta como totalmente bloqueado (vai completar)', P.totalmenteBloqueado(parcial) === false);
    check('estado totalmente censurado → totalmenteBloqueado true', P.totalmenteBloqueado(plano) === true);
    check('estado original → totalmenteBloqueado false', P.totalmenteBloqueado(orig) === false);
    check('sem números de WhatsApp conta como censurado (nada a esconder)', P.whatsappBloqueado({ whatsapp: { numbers: [] } }) === true);
    check('whatsapp placeholder é reconhecido mesmo reformatado pelo painel', P.whatsappBloqueado({ whatsapp: { numbers: [{ number: '(00) 00000-0000' }] } }) === true);
  }

  console.log('\n=== Salvaguardas ===');
  {
    let erro = null; try { P.planoCensura(estadoReal(), { emailMarca: '' }); } catch (e) { erro = e.message; }
    check('recusa sem e-mail da marca', !!erro, erro || 'não lançou');
    // e-mail já censurado + telefone placeholder ⇒ detecta bloqueado mesmo com formatação
    const jaBloq = { addresses: [{ id: 'x', phones: [{ numero: '(00) 00000-0000' }], emails: [{ email: 'CONTATO@idealtrends.com.br' }] }] };
    check('detecção tolera caixa/format do e-mail', P.estaBloqueado(jaBloq) === true);
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
