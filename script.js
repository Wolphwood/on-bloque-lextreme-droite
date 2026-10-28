(() => {
  if (window.ToastNotification) return;

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    maxWidth: "420px",
    pointerEvents: "none"
  });
  document.body.appendChild(container);

  const colors = {
    success: "#16a34a",
    error: "#dc2626",
    warn: "#d97706",
    info: "#2563eb"
  };

  window.ToastNotification = (message, type = "info", duration = 4000) => {
    const toast = document.createElement("div");
    toast.textContent = message;

    console[type]?.("[XTools]", message);

    Object.assign(toast.style, {
      background: colors[type] || colors.info,
      color: "#fff",
      padding: "6px 9px",
      borderRadius: "6px",
      boxShadow: "0 4px 16px rgba(0,0,0,.3)",
      font: "12px Arial, sans-serif",
      lineHeight: "1.5",
      overflowWrap: "anywhere",
      cursor: "pointer",
      pointerEvents: "auto",
      transition: "opacity .25s, transform .25s",
      opacity: "1",
      transform: "translateX(0)"
    });

    const dismiss = () => {
      if (!toast.isConnected) return;
      toast.style.opacity = "0";
      toast.style.transform = "translateX(30px)";
      setTimeout(() => toast.remove(), 250);
    };

    let timeout = setTimeout(dismiss, duration);
    toast.addEventListener("click", dismiss);
    toast.addEventListener("mouseenter", () => clearTimeout(timeout));
    toast.addEventListener("mouseleave", () => timeout = setTimeout(dismiss, duration));

    container.prepend(toast);
    return toast;
  };
})();

(() => {
  let bearer = null;
  let resolveAuth;
  const authReady = new Promise(resolve => resolveAuth = resolve);
  const requests = new WeakMap();

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalFetch = window.fetch;

  const isX = url => {
    try { return ["x.com", "api.x.com"].includes(new URL(url, location.href).hostname); }
    catch { return false; }
  };

  const restore = () => {
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.setRequestHeader = originalSetHeader;
    window.fetch = originalFetch;
  };

  const capture = (url, value) => {
    if (bearer || !isX(url) || !/^Bearer\s+\S+/i.test(value || "")) return;
    bearer = value;
    restore();
    resolveAuth();
    ToastNotification("Authentification récupérée, interception désactivée.");
  };

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    requests.set(this, url);
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (name.toLowerCase() === "authorization") capture(requests.get(this), value);
    return originalSetHeader.call(this, name, value);
  };

  window.fetch = function(input, init) {
    const url = input instanceof Request ? input.url : input;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    capture(url, headers.get("authorization"));
    return originalFetch.apply(this, arguments);
  };

  const getCSRF = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || "");

  async function request(url, options = {}) {
    await authReady;
    const csrf = getCSRF();
    if (!csrf) throw new Error("[XTools] Token CSRF introuvable.");

    const response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        authorization: bearer,
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": "fr",
        ...options.headers
      }
    });

    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = raw; }

    if (!response.ok || data?.errors?.length) {
      throw new Error(`[XTools] HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
  }

  async function getUserId(username) {
    username = String(username).trim().replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(username)) throw new Error("[XTools] Username invalide.");

    const params = new URLSearchParams({
      variables: JSON.stringify({
        screen_name: username,
        withGrokTranslatedBio: true
      }),
      features: JSON.stringify({
        hidden_profile_subscriptions_enabled: true,
        profile_label_improvements_pcf_label_in_post_enabled: true,
        responsive_web_profile_redirect_enabled: true,
        rweb_tipjar_consumption_enabled: false,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true
      }),
      fieldToggles: JSON.stringify({
        withPayments: false,
        withAuxiliaryUserLabels: true
      })
    });

    const data = await request(`https://x.com/i/api/graphql/AMIBMjtxEEATh4z8V9GtRg/UserByScreenName?${params}`);
    const userId = data?.data?.user?.result?.rest_id;
    if (!userId) throw new Error(`[XTools] Impossible de trouver @${username}.`);
    return userId;
  }

  async function blockUser(userId) {
    userId = String(userId);
    if (!/^\d+$/.test(userId)) throw new Error("[XTools] User ID invalide.");

    return request("https://x.com/i/api/1.1/blocks/create.json", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ user_id: userId })
    });
  }

  async function blockByUsername(username) {
    const userId = await getUserId(username);
    const result = await blockUser(userId);
    ToastNotification(`[XTools] @${username.replace(/^@/, "")} (${userId}) bloqué.`, "success");
    return result;
  }

  window.XTools = Object.freeze({
    getUserId,
    blockUser,
    blockByUsername,
    ready: authReady,
    isReady: () => !!bearer
  });

  ToastNotification("Initialisé, en attente du Bearer...");
})();

(async () => {
  const Wait = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

  await XTools.ready;
  ToastNotification("Ready!", "info");

  const accounts = [ "MLP_officiel", "J_Bardella", "RNational_off", "ZemmourEric", "Coll_Nemesis", "alexandreloubet", "ASabatou", "alexisjollyrn", "CordierAlice2", "angelique_ranc", "annesicard1", "AntBoulogne54", "villedieu_a", "Au_Evrard", "A_Dutremble", "BChaumeil_RN", "BrunoBilde", "BrunoClavet", "ROULLAUDBEATRIC", "CColombier_RN", "Parmentier_RN", "cathRimbert84", "BentzChristophe", "TribuianiCyril", "DamienRieu", "EddyCasterman", "EmericSalmon", "BlairyEmmanuel", "e_Fouquart", "F_Desouche", "Flo_Joubert", "franckallisio", "Boccaletti83", "Fredericvo79738", "G_Dussausaye", "gisele_lelouis", "Guillaume_Bigot", "GrangierGe", "H2Lepinau", "HeleneLaporteRN", "Jphtanguy", "JocelynDessigny", "JonathanGery_AN", "jordan_guitton", "JorysB3", "beaurainjose", "JoelleMelinRN", "JLechanteux", "JulienGabarron", "julien_limongi", "JulienOdoul", "J_Rancoule", "JRochedy", "jerome_buisson", "MauvieuxKevin", "k_pfeffer", "ljacobelli", "Lionel_Tivoli", "MarcDeFleurian", "FranceLorho", "marine_hamelet", "MarionMarechal", "MatthiasRN", "MarchioMatthieu", "MaximeAmblard5", "TaverneMichael", "MichelGuiniot", "MichleMartinez3", "nadinelechon", "NathCarvalho91", "NMeizonnet", "ObjectifRemi", "BallardPhilippe", "phlottiaux", "Ph_Schreck", "Meurin_P", "FrDesouche", "Reconquete_off", "RenaudCamus", "RNGrandEst", "rn_paca", "RNational_IDF", "LeBourgeois7610", "ChudeauR", "knafo_sarah", "Serge_Muller24", "sblanc66000", "stephan1Rambaud", "sebchenu", "Seb_Humbert", "ThaisEscufon", "MonnierThibaut", "thierry_frappe", "thierryperez43", "Thomas_Mng", "Th_Bnrdt", "Tiffany_Joncour", "T_Houssin", "YaelMenache", "YoannGillet30", "CNEWS", "CNEWSLesOFF", "Frontieresmedia", "linfiltremedia", "Valeurs", "BVoltaire", "tegnererik", "PascalPraud", "christine_kelly", "LaurenceFerrari", "GauthierBret", "deval_eliot", "gabriellecluzel", "mbockcote", "ivanrioufol", "Vero_Jacquier", "anthonyfavalli", "YOANNUSAI", "ElodieHuchard", "ThomasBonnet", "quentingerard_", "rstainville", "S_Lignier", "JulesTorres17", "Jules_Laurans", "DavidAlaime", "JordanFlrtn", "Lauriane_Bd", "Guillaume_fcqt", "anais_marechal_", "evaduparc", "rigault_charles", "GarenShn", "YannMontero", "SevilliaYves", "alienordep", "wdeguerpel", "Eynaud_Marc", "radouan_kourak", "jean_bexon", "tvlofficiel", "BildMartial", "jylgallou", "JulietteBriens", "MagLincorrect", "Incorrectibles", "csapin", "p_condomines", "mathildeklotgen", "IrisBridier", "coupeau_maxime", "NicolasBoutin11", "VltnGR", "LegayMaxime1", "VictorLefebvre", "morandiniblog", "Pierre_GTIL", "jean_de_lacoste", "GrisetCatherine", "jsanchez_rn", "thierrymariani", "v_joron", "AndreRougeOff", "mandrouet", "pr_thionnet", "jrechagneux", "fabriceleggeri", "asfrigout", "ValerieDeloge", "jleonardelli_", "groupeRN_off", "jllacapelle", "louis_aliot", "CocardeEtud", "InstitutILIADE", "LNatifs", "actionfrancaise" ].sort(() => Math.random() - 0.5);
  
  const unique = [...new Set(accounts.map(account => account.trim().replace(/^@/, "")))];
  const stats = { success: 0, failed: 0, errors: [] };

  window.stopXBlocks = false;

  for (const [index, account] of unique.entries()) {
    if (window.stopXBlocks) {
      ToastNotification("Traitement interrompu manuellement.", "warn");
      break;
    }

    console.log(`[XTools] ${index + 1}/${unique.length} - @${account}`);

    try {
      await XTools.blockByUsername(account);
      stats.success++;
    } catch (err) {
      stats.failed++;
      stats.errors.push({ account, error: String(err) });
      ToastNotification(`[XTools] Échec @${account}:`, 'error');
      console.error(err);

      if (/\b429\b/.test(String(err))) {
        ToastNotification("Rate limit détecté. Arrêt du traitement.", "warn");
        break;
      }
    }

    if (index < unique.length - 1) {
      const ms = 3000 + Math.random() * 5000;
      console.log(`[XTools] Next request in ${(ms / 1000).toFixed(2)}s`);
      await Wait(ms);
    }
  }

  ToastNotification(`[XTools] Terminé : ${stats.success} succès, ${stats.failed} échecs.`, "success");
  if (stats.errors.length) console.table(stats.errors);
})();
