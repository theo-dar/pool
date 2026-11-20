/* =====================================================================
   POOL — app de budget de Teddy
   Le fichier est divisé en 6 sections. Chaque section a un seul rôle :
     1. DONNÉES PAR DÉFAUT  → les catégories, abonnements et objectifs de départ
     2. SAUVEGARDE          → lire/écrire les données dans le navigateur (localStorage)
     3. OUTILS DE DATES     → trouver le lundi de la semaine, formater, etc.
     4. CALCULS             → combien il reste dans le pool, par catégorie, etc.
     5. AFFICHAGE           → construire le HTML de chaque écran
     6. ACTIONS             → ce qui se passe quand tu cliques (ajouter, supprimer…)
   Le flux : action → modifie `etat` → sauvegarder() → afficher()
   ===================================================================== */


/* =====================================================================
   1. DONNÉES PAR DÉFAUT
   Utilisées seulement la toute première fois que l'app s'ouvre.
   Les cibles viennent du plan dans le PDF (≈ 200 $/semaine).
   ===================================================================== */
const CATEGORIES_DEFAUT = [
  { id: 'shopping',  nom: 'Shopping',          emoji: '🛍️', cible: 25 },
  { id: 'restos',    nom: 'Restos',            emoji: '🍔', cible: 30 },
  { id: 'bars',      nom: 'Bars & alcool',     emoji: '🍻', cible: 25 },
  { id: 'epicerie',  nom: 'Épicerie',          emoji: '🛒', cible: 35 },
  { id: 'cafes',     nom: 'Cafés & snacks',    emoji: '☕', cible: 15 },
  { id: 'abos',      nom: 'Abonnements',       emoji: '🔁', cible: 15 },
  { id: 'transport', nom: 'Transport',         emoji: '🚌', cible: 24 },
  { id: 'sorties',   nom: 'Sorties',           emoji: '🎳', cible: 11 },
  { id: 'ecole',     nom: 'École',             emoji: '📚', cible: 10 },
  { id: 'pharmacie', nom: 'Pharmacie',         emoji: '💊', cible: 8 },
  { id: 'autre',     nom: 'Autre',             emoji: '📦', cible: 0 },
];

// jour = jour du mois où le prélèvement passe (vu dans tes relevés)
const ABOS_DEFAUT = [
  { id: 'claude',  nom: 'Claude',            montant: 32.19, jour: 26, aAnnuler: false },
  { id: 'spotify', nom: 'Spotify',           montant: 16.09, jour: 30, aAnnuler: false },
  { id: 'serato',  nom: 'Serato DJ Pro',     montant: 20.20, jour: 17, aAnnuler: true  },
  { id: 'tidal',   nom: 'Tidal',             montant: 16.66, jour: 8,  aAnnuler: true  },
  { id: 'prime',   nom: 'Amazon Prime',      montant: 5.74,  jour: 24, aAnnuler: false },
  { id: 'apple',   nom: 'Apple',             montant: 4.59,  jour: 24, aAnnuler: false },
  { id: 'lucky',   nom: 'Lucky Mobile',      montant: 40.24, jour: 13, aAnnuler: false },
];

// Types de revenus (les « catégories » de l'argent qui rentre)
const REVENUS = [
  { id: 'rev-salaire',   nom: 'Salaire Sakura', emoji: '🍣' },
  { id: 'rev-tips',      nom: 'Pourboires',     emoji: '💵' },
  { id: 'rev-protecio',  nom: 'Protecio',       emoji: '💻' },
  { id: 'rev-autre',     nom: 'Autre',          emoji: '➕' },
];

// Vide dans le code : le dépôt GitHub est public, tes vrais montants restent dans ta sauvegarde
const TIPS_DEFAUT = [];

const OBJECTIFS_DEFAUT = [
  { id: 'voyage',  nom: 'Voyage (7 juin)',        cible: 7000, actuel: 0 },
  { id: 'epargne', nom: 'Épargne hors voyage',    cible: 5000, actuel: 0 },
];

function etatDeDepart() {
  return {
    version: 2,
    poolHebdo: 150,
    categories: CATEGORIES_DEFAUT,
    abos: ABOS_DEFAUT.map(a => ({ ...a, prochaineDate: prochaineOccurrence(a.jour) })),
    objectifs: OBJECTIFS_DEFAUT,
    transactions: [],   // { id, date: 'AAAA-MM-JJ', montant, type: 'depense'|'revenu', cat, note }
    tips: TIPS_DEFAUT,  // { id, date, montant, recu, dateRecu }
  };
}


/* =====================================================================
   2. SAUVEGARDE
   localStorage = un petit espace de stockage dans le navigateur.
   Tes données restent sur l'appareil : rien n'est envoyé sur Internet.
   (Conséquence : l'iPad et l'ordi ont chacun leurs données → voir Exporter/Importer.)
   ===================================================================== */
const CLE = 'pool-teddy-v1';

function charger() {
  try {
    const texte = localStorage.getItem(CLE);
    if (texte) return JSON.parse(texte);
  } catch (e) { console.warn('Lecture impossible', e); }
  return etatDeDepart();
}

function sauvegarder() {
  try { localStorage.setItem(CLE, JSON.stringify(etat)); }
  catch (e) { alert("Impossible de sauvegarder : " + e.message); }
}

// Migration : met à jour les données déjà sauvegardées quand l'app gagne de nouvelles fonctions.
// (Les DONNÉES PAR DÉFAUT ne s'appliquent qu'à la première ouverture, d'où ce bloc.)
function migrer(e) {
  if ((e.version || 1) < 2) {
    if (e.poolHebdo === 200) e.poolHebdo = 150;
    if (!e.abos.some(a => a.id === 'lucky')) {
      const lucky = ABOS_DEFAUT.find(a => a.id === 'lucky');
      e.abos.push({ ...lucky, prochaineDate: prochaineOccurrence(lucky.jour) });
    }
    if (!e.tips) e.tips = TIPS_DEFAUT;
    for (const t of e.transactions) if (t.type === 'revenu' && t.cat === 'revenu') t.cat = 'rev-autre';
    e.version = 2;
  }
  return e;
}

let etat = migrer(charger());
sauvegarder();


/* =====================================================================
   3. OUTILS DE DATES
   On garde toutes les dates en texte 'AAAA-MM-JJ' : facile à comparer et à trier.
   ===================================================================== */
function enTexte(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}
function versDate(texte) {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j);
}
function aujourdhui() { return enTexte(new Date()); }

// Le lundi de la semaine qui contient cette date (la semaine va du lundi au dimanche)
function lundiDe(texte) {
  const d = versDate(texte);
  const decalage = (d.getDay() + 6) % 7;   // dimanche=0 → 6, lundi=1 → 0
  d.setDate(d.getDate() - decalage);
  return enTexte(d);
}
function ajouterJours(texte, n) {
  const d = versDate(texte); d.setDate(d.getDate() + n); return enTexte(d);
}

// Prochaine date (après aujourd'hui) où tombe le jour `jour` du mois
function prochaineOccurrence(jour, apres = aujourdhui()) {
  const base = versDate(apres);
  for (let i = 0; i < 3; i++) {
    const mois = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const dernierJour = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
    const candidat = enTexte(new Date(mois.getFullYear(), mois.getMonth(), Math.min(jour, dernierJour)));
    if (candidat > apres) return candidat;
  }
}

function argent(n) {
  return n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
}
function jolieDate(texte) {
  return versDate(texte).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
}


/* =====================================================================
   4. CALCULS
   Aucune de ces fonctions ne touche à l'écran : elles prennent des données
   et retournent des chiffres. (Facile à tester séparément.)
   ===================================================================== */
function transactionsDeLaSemaine(lundi) {
  const dimanche = ajouterJours(lundi, 6);
  return etat.transactions.filter(t => t.date >= lundi && t.date <= dimanche);
}

function resumeSemaine(lundi) {
  const txs = transactionsDeLaSemaine(lundi);
  const depense = txs.filter(t => t.type === 'depense').reduce((s, t) => s + t.montant, 0);
  const revenu  = txs.filter(t => t.type === 'revenu').reduce((s, t) => s + t.montant, 0);
  const parCat = {};
  for (const t of txs) if (t.type === 'depense') parCat[t.cat] = (parCat[t.cat] || 0) + t.montant;
  return { txs, depense, revenu, parCat, reste: etat.poolHebdo - depense, bilan: revenu - depense };
}

function categorie(id) {
  return etat.categories.find(c => c.id === id) || REVENUS.find(r => r.id === id) || { nom: id, emoji: '•' };
}

function tipsEnAttente() {
  return etat.tips.filter(t => !t.recu);
}

// Les abonnements dont la date est arrivée deviennent des dépenses automatiquement
function traiterAbonnements() {
  const auj = aujourdhui();
  let changement = false;
  for (const a of etat.abos) {
    while (a.prochaineDate && a.prochaineDate <= auj) {
      etat.transactions.push({ id: nouvelId(), date: a.prochaineDate, montant: a.montant,
                               type: 'depense', cat: 'abos', note: a.nom + ' (auto)' });
      a.prochaineDate = prochaineOccurrence(a.jour, a.prochaineDate);
      changement = true;
    }
  }
  if (changement) sauvegarder();
}

function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }


/* =====================================================================
   5. AFFICHAGE
   Chaque fonction afficherX() remplit une <section> de index.html.
   ===================================================================== */
function afficher() {
  afficherSemaine();
  afficherHistorique();
  afficherAbos();
  afficherTips();
  afficherPlus();
}

function afficherSemaine() {
  const lundi = lundiDe(aujourdhui());
  const r = resumeSemaine(lundi);
  const pct = Math.min(100, (r.depense / etat.poolHebdo) * 100);
  const joursRestants = 7 - ((versDate(aujourdhui()).getDay() + 6) % 7);

  // Une ligne par catégorie qui a une cible ou des dépenses
  const lignes = etat.categories
    .filter(c => c.cible > 0 || r.parCat[c.id])
    .map(c => {
      const d = r.parCat[c.id] || 0;
      const p = c.cible ? Math.min(100, d / c.cible * 100) : 100;
      return `<div class="ligne-cat">
        <div class="haut"><span>${c.emoji} ${c.nom}</span><span>${argent(d)} / ${argent(c.cible)}</span></div>
        <div class="barre petite"><div class="${d > c.cible ? 'depasse' : ''}" style="width:${p}%"></div></div>
      </div>`;
    }).join('');

  const liste = r.txs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(ligneTransaction).join('')
             || '<div class="vide">Aucune transaction cette semaine.</div>';

  document.getElementById('vue-semaine').innerHTML = `
    <h1>Cette semaine</h1>
    <div class="carte">
      <div class="sous">Il te reste</div>
      <div class="pool-reste ${r.reste < 0 ? 'negatif' : ''}">${argent(r.reste)}</div>
      <div class="sous">sur ${argent(etat.poolHebdo)} · ${joursRestants} jour${joursRestants > 1 ? 's' : ''} avant lundi</div>
      <div class="barre"><div class="${r.reste < 0 ? 'depasse' : ''}" style="width:${pct}%"></div></div>
    </div>
    <div class="carte stats">
      <div><span class="sous">Entré</span><b>${argent(r.revenu)}</b></div>
      <div><span class="sous">Dépensé</span><b>${argent(r.depense)}</b></div>
      <div><span class="sous">Bilan</span><b class="${r.bilan < 0 ? 'rouge' : 'vert'}">${r.bilan >= 0 ? '+' : ''}${argent(r.bilan)}</b></div>
    </div>
    ${tipsEnAttente().length ? `<div class="sous" style="margin:-4px 0 8px">💔 ${argent(tipsEnAttente().reduce((s, t) => s + t.montant, 0))} de tips pas encore reçus (onglet Tips)</div>` : ''}
    <h2>Par catégorie</h2>
    <div class="carte">${lignes}</div>
    <h2>Transactions</h2>
    <div class="carte">${liste}</div>`;
}

function ligneTransaction(t) {
  const c = categorie(t.cat);
  const estRevenu = t.type === 'revenu';
  return `<div class="tx">
    <div class="info">
      <div>${c.emoji} ${t.note || c.nom}</div>
      <div>${jolieDate(t.date)} · ${c.nom}</div>
    </div>
    <span class="montant ${estRevenu ? 'revenu' : ''}">${estRevenu ? '+' : '−'}${argent(t.montant)}</span>
    <button class="suppr" data-suppr="${t.id}" aria-label="Supprimer">×</button>
  </div>`;
}

function afficherHistorique() {
  // 12 dernières semaines, de la plus récente à la plus ancienne
  let lundi = lundiDe(aujourdhui());
  const lignes = [];
  for (let i = 0; i < 12; i++) {
    const r = resumeSemaine(lundi);
    const pct = Math.min(100, r.depense / etat.poolHebdo * 100);
    lignes.push(`<div class="semaine-hist">
      <span>${versDate(lundi).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}</span>
      <div class="barre"><div class="${r.depense > etat.poolHebdo ? 'depasse' : ''}" style="width:${pct}%"></div></div>
      <span>${argent(r.depense)}</span>
      <span class="${r.bilan < 0 ? 'rouge' : 'vert'}">${r.revenu ? (r.bilan >= 0 ? '+' : '') + argent(r.bilan) : '—'}</span>
    </div>`);
    lundi = ajouterJours(lundi, -7);
  }
  document.getElementById('vue-historique').innerHTML = `
    <h1>Historique</h1>
    <div class="sous">Barre = dépenses (pleine = pool de ${argent(etat.poolHebdo)} atteint, rouge = dépassé). Dernière colonne = bilan (entré − dépensé), « — » si aucun revenu noté.</div>
    <div class="carte" style="margin-top:12px">${lignes.join('')}</div>`;
}

function afficherAbos() {
  const total = etat.abos.reduce((s, a) => s + a.montant, 0);
  const aEconomiser = etat.abos.filter(a => a.aAnnuler).reduce((s, a) => s + a.montant, 0);
  const lignes = etat.abos.slice().sort((a, b) => a.prochaineDate.localeCompare(b.prochaineDate)).map(a => `
    <div class="tx">
      <div class="info">
        <div>${a.nom}${a.aAnnuler ? '<span class="badge">à annuler</span>' : ''}</div>
        <div>Prochain prélèvement : ${jolieDate(a.prochaineDate)}</div>
      </div>
      <span class="montant">${argent(a.montant)}</span>
      <button class="suppr" data-suppr-abo="${a.id}" aria-label="Retirer">×</button>
    </div>`).join('') || '<div class="vide">Aucun abonnement.</div>';

  document.getElementById('vue-abos').innerHTML = `
    <h1>Abonnements</h1>
    <div class="carte stats">
      <div><span class="sous">Par mois</span><b>${argent(total)}</b></div>
      <div><span class="sous">Si tu annules les « à annuler »</span><b>−${argent(aEconomiser)}</b></div>
    </div>
    <div class="carte">${lignes}</div>
    <div class="sous">Quand tu annules un abonnement, appuie sur × pour le retirer. Les prélèvements s'ajoutent tout seuls comme dépenses le jour où ils passent.</div>
    <h2>Ajouter un abonnement</h2>
    <div class="carte">
      <form id="form-abo" style="display:flex;flex-direction:column;gap:8px">
        <input class="champ" name="nom" placeholder="Nom (ex. Netflix)" required>
        <input class="champ" name="montant" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Montant par mois" required>
        <input class="champ" name="jour" type="number" min="1" max="31" placeholder="Jour du mois (1-31)" required>
        <button class="bouton-plein principal">Ajouter l'abonnement</button>
      </form>
    </div>`;
}

function afficherTips() {
  const attente = tipsEnAttente().sort((a, b) => a.date.localeCompare(b.date));
  const recus = etat.tips.filter(t => t.recu).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const total = attente.reduce((s, t) => s + t.montant, 0);
  const ligne = t => `<div class="tx">
      <div class="info">
        <div>${t.recu ? '✅' : '💔'} Quart du ${jolieDate(t.date)}</div>
        <div>${t.recu ? 'Reçu le ' + jolieDate(t.dateRecu) : 'Pas encore reçu'}</div>
      </div>
      <span class="montant">${argent(t.montant)}</span>
      ${t.recu ? `<button class="suppr" data-suppr-tip="${t.id}" aria-label="Supprimer">×</button>`
               : `<button class="petit-bouton" data-recu="${t.id}">Reçu</button>`}
    </div>`;

  document.getElementById('vue-tips').innerHTML = `
    <h1>Pourboires</h1>
    <div class="carte">
      <div class="sous">Le Sakura te doit encore</div>
      <div class="pool-reste">${argent(total)}</div>
      <div class="sous">${attente.length} quart${attente.length > 1 ? 's' : ''} en attente</div>
    </div>
    <h2>Noter un quart</h2>
    <div class="carte">
      <form id="form-tip" style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="champ" name="date" type="date" value="${aujourdhui()}" required style="flex:1;min-width:140px">
        <input class="champ" name="montant" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Tips ($)" required style="flex:1;min-width:110px">
        <button class="bouton-plein principal" style="margin-top:0">Ajouter 💔</button>
      </form>
    </div>
    <h2>En attente</h2>
    <div class="carte">${attente.map(ligne).join('') || '<div class="vide">Rien en attente. 🎉</div>'}</div>
    <div class="sous">Quand l'argent rentre, appuie sur « Reçu » : ça l'ajoute comme revenu (Pourboires) dans ta semaine.</div>
    <h2>Reçus récemment</h2>
    <div class="carte">${recus.map(ligne).join('') || '<div class="vide">Aucun pour l\'instant.</div>'}</div>`;
}

function afficherPlus() {
  const objectifs = etat.objectifs.map(o => {
    const p = Math.min(100, o.actuel / o.cible * 100);
    return `<div class="ligne-cat">
      <div class="haut"><span>${o.nom}</span><span>${argent(o.actuel)} / ${argent(o.cible)}</span></div>
      <div class="barre"><div style="width:${p}%"></div></div>
      <div class="reglage"><span class="sous">Montant actuel</span>
        <input type="number" step="0.01" data-objectif="${o.id}" value="${o.actuel}"></div>
    </div>`;
  }).join('');

  const cibles = etat.categories.map(c => `
    <div class="reglage"><span>${c.emoji} ${c.nom}</span>
      <input type="number" step="1" min="0" data-cible="${c.id}" value="${c.cible}"></div>`).join('');
  const sommeCibles = etat.categories.reduce((s, c) => s + c.cible, 0);

  document.getElementById('vue-plus').innerHTML = `
    <h1>Objectifs & réglages</h1>
    <h2>Objectifs d'épargne</h2>
    <div class="carte">${objectifs}</div>

    <h2>Pool de la semaine</h2>
    <div class="carte">
      <div class="reglage"><span>Montant par semaine</span>
        <input type="number" step="1" min="0" id="champ-pool" value="${etat.poolHebdo}"></div>
      <div class="sous" style="margin-top:6px">Somme des cibles par catégorie : ${argent(sommeCibles)}</div>
    </div>

    <h2>Cible par catégorie ($/semaine)</h2>
    <div class="carte">${cibles}</div>

    <h2>Données</h2>
    <div class="carte">
      <div class="sous">Importer un CSV avec les colonnes date, desc, amount, categorie (comme historique_carte.csv).</div>
      <input type="file" id="fichier-csv" accept=".csv" class="champ" style="margin-top:8px">
      <button class="bouton-plein secondaire" id="btn-exporter">Exporter une sauvegarde (.json)</button>
      <div class="sous" style="margin-top:8px">Restaurer une sauvegarde (pour passer de l'ordi à l'iPad) :</div>
      <input type="file" id="fichier-json" accept=".json" class="champ" style="margin-top:6px">
    </div>`;
}


/* =====================================================================
   6. ACTIONS
   On écoute les clics à un seul endroit (document) et on regarde sur quoi
   on a cliqué. C'est plus simple que d'attacher un écouteur à chaque bouton.
   ===================================================================== */

// --- Navigation entre les écrans
document.querySelector('nav').addEventListener('click', e => {
  const bouton = e.target.closest('button[data-vue]');
  if (!bouton) return;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b === bouton));
  document.querySelectorAll('.vue').forEach(v => v.classList.toggle('active', v.id === 'vue-' + bouton.dataset.vue));
  window.scrollTo(0, 0);
});

// --- Ouvrir le formulaire d'ajout
const dialog = document.getElementById('dialog-ajout');
const form = document.getElementById('form-ajout');
let categorieChoisie = 'restos';

document.getElementById('btn-ajouter').addEventListener('click', () => {
  form.reset();
  form.date.value = aujourdhui();
  afficherChips();
  dialog.showModal();
  form.montant.focus();
});
document.getElementById('btn-annuler').addEventListener('click', () => dialog.close());

let revenuChoisi = 'rev-salaire';

function afficherChips() {
  const estRevenu = form.type.value === 'revenu';
  const liste = estRevenu ? REVENUS : etat.categories;
  const choisi = estRevenu ? revenuChoisi : categorieChoisie;
  document.getElementById('choix-categories').innerHTML = liste.map(c =>
    `<button type="button" data-cat="${c.id}" class="${c.id === choisi ? 'choisi' : ''}">${c.emoji} ${c.nom}</button>`
  ).join('');
}
form.addEventListener('change', e => { if (e.target.name === 'type') afficherChips(); });
document.getElementById('choix-categories').addEventListener('click', e => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  if (form.type.value === 'revenu') revenuChoisi = b.dataset.cat;
  else categorieChoisie = b.dataset.cat;
  afficherChips();
});

// --- Enregistrer la dépense / le revenu
form.addEventListener('submit', e => {
  e.preventDefault();
  const montant = parseFloat(form.montant.value.replace(',', '.'));
  if (!(montant > 0)) return;
  const type = form.type.value;
  etat.transactions.push({
    id: nouvelId(), date: form.date.value, montant, type,
    cat: type === 'revenu' ? revenuChoisi : categorieChoisie,
    note: form.note.value.trim(),
  });
  sauvegarder();
  dialog.close();
  afficher();
});

// --- Supprimer une transaction ou un abonnement (bouton ×)
document.addEventListener('click', e => {
  const t = e.target.closest('[data-suppr]');
  if (t && confirm('Supprimer cette transaction ?')) {
    etat.transactions = etat.transactions.filter(x => x.id !== t.dataset.suppr);
    sauvegarder(); afficher();
  }
  const a = e.target.closest('[data-suppr-abo]');
  if (a && confirm('Retirer cet abonnement ? (à faire quand tu l\'as annulé)')) {
    etat.abos = etat.abos.filter(x => x.id !== a.dataset.supprAbo);
    sauvegarder(); afficher();
  }
});

// --- Tips : noter un quart, marquer « reçu », supprimer
document.addEventListener('submit', e => {
  if (e.target.id !== 'form-tip') return;
  e.preventDefault();
  const f = e.target;
  etat.tips.push({ id: nouvelId(), date: f.date.value, montant: parseFloat(f.montant.value), recu: false });
  sauvegarder(); afficher();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-recu]');
  if (b) {
    const tip = etat.tips.find(t => t.id === b.dataset.recu);
    tip.recu = true;
    tip.dateRecu = aujourdhui();
    tip.txId = nouvelId();
    // Le tip devient un revenu de la semaine où l'argent rentre vraiment
    etat.transactions.push({ id: tip.txId, date: tip.dateRecu, montant: tip.montant, type: 'revenu',
                             cat: 'rev-tips', note: 'Tips du ' + jolieDate(tip.date) });
    sauvegarder(); afficher();
  }
  const s = e.target.closest('[data-suppr-tip]');
  if (s && confirm('Supprimer ce tip (et le revenu associé) ?')) {
    const tip = etat.tips.find(t => t.id === s.dataset.supprTip);
    etat.tips = etat.tips.filter(t => t !== tip);
    etat.transactions = etat.transactions.filter(t => t.id !== tip.txId);
    sauvegarder(); afficher();
  }
});

// --- Ajouter un abonnement
document.addEventListener('submit', e => {
  if (e.target.id !== 'form-abo') return;
  e.preventDefault();
  const f = e.target;
  const jour = parseInt(f.jour.value, 10);
  etat.abos.push({ id: nouvelId(), nom: f.nom.value.trim(), montant: parseFloat(f.montant.value),
                   jour, aAnnuler: false, prochaineDate: prochaineOccurrence(jour) });
  sauvegarder(); afficher();
});

// --- Modifier un réglage (pool, cibles, objectifs)
document.addEventListener('change', e => {
  const el = e.target;
  const v = parseFloat(el.value) || 0;
  if (el.id === 'champ-pool') etat.poolHebdo = v;
  else if (el.dataset.cible) categorie(el.dataset.cible).cible = v;
  else if (el.dataset.objectif) etat.objectifs.find(o => o.id === el.dataset.objectif).actuel = v;
  else if (el.id === 'fichier-csv') return importerCSV(el.files[0]);
  else if (el.id === 'fichier-json') return restaurerJSON(el.files[0]);
  else return;
  sauvegarder(); afficher();
});

// --- Import CSV (historique de la carte)
const CORRESPONDANCE = {
  'Shopping (Amazon, vêtements, etc.)': 'shopping', 'Restos & fast-food': 'restos',
  'Alcool, bars & cannabis': 'bars', 'Épicerie': 'epicerie', 'Café & snacks': 'cafes',
  'Abonnements': 'abos', 'Transport': 'transport', 'Sorties & activités': 'sorties',
  'École': 'ecole', 'Santé & pharmacie': 'pharmacie', 'Autre': 'autre',
};
function lireLigneCSV(ligne) {
  // Gère les virgules à l'intérieur de "guillemets"
  const champs = []; let cur = '', guill = false;
  for (const ch of ligne) {
    if (ch === '"') guill = !guill;
    else if (ch === ',' && !guill) { champs.push(cur); cur = ''; }
    else cur += ch;
  }
  champs.push(cur);
  return champs;
}
async function importerCSV(fichier) {
  if (!fichier) return;
  const lignes = (await fichier.text()).trim().split(/\r?\n/);
  const entete = lireLigneCSV(lignes[0]);
  const iDate = entete.indexOf('date'), iDesc = entete.indexOf('desc'),
        iMontant = entete.indexOf('amount'), iCat = entete.indexOf('categorie');
  if (iDate < 0 || iMontant < 0) return alert('Colonnes date et amount introuvables.');
  // Évite les doublons si on importe deux fois le même fichier
  const dejaLa = new Set(etat.transactions.map(t => t.date + '|' + t.montant + '|' + t.note));
  let ajoutees = 0;
  for (const l of lignes.slice(1)) {
    const c = lireLigneCSV(l);
    const montant = parseFloat(c[iMontant]);
    const cat = CORRESPONDANCE[c[iCat]];
    if (!cat || !(montant > 0)) continue;   // on ignore paiements de carte et remises
    const t = { id: nouvelId(), date: c[iDate], montant, type: 'depense', cat, note: (c[iDesc] || '').trim() };
    const cle = t.date + '|' + t.montant + '|' + t.note;
    if (dejaLa.has(cle)) continue;
    etat.transactions.push(t); ajoutees++;   // (pas de dejaLa.add : deux achats identiques le même jour sont gardés)
  }
  sauvegarder(); afficher();
  alert(`${ajoutees} transactions importées.`);
}

// --- Exporter / restaurer une sauvegarde complète
document.addEventListener('click', e => {
  if (e.target.id !== 'btn-exporter') return;
  const blob = new Blob([JSON.stringify(etat, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pool-sauvegarde-${aujourdhui()}.json`;
  a.click();
});
async function restaurerJSON(fichier) {
  if (!fichier) return;
  try {
    const donnees = JSON.parse(await fichier.text());
    if (!donnees.transactions) throw new Error('fichier invalide');
    if (!confirm('Remplacer toutes les données de cet appareil par cette sauvegarde ?')) return;
    etat = donnees; sauvegarder(); afficher();
  } catch (err) { alert('Sauvegarde illisible : ' + err.message); }
}


/* ===== Démarrage ===== */
traiterAbonnements();
afficher();

// Mode hors-ligne (seulement quand l'app est en ligne via https, ex. GitHub Pages)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
