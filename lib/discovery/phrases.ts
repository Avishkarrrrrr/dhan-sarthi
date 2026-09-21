import type { DiscoverySlot, RiskProfile } from "@/lib/contracts/types";

/**
 * Everything the avatar says, in every language it says it in.
 *
 * The interview was English-only while the demo script promised Hindi. Sarvam
 * will happily *speak* an English sentence in an Indian voice, which sounds
 * like it works and is not the same thing at all — a customer being asked
 * about their retirement in a language they do not read is not being
 * interviewed, they are being performed at.
 *
 * Bundled rather than machine-translated at runtime. These are eight fixed
 * questions; translating them live would add a network call, a failure path
 * and a wait to every single turn of a conversation that has to hold a room's
 * attention. Written out, they cannot fail and cannot drift.
 *
 * Amounts stay in western numerals with Indian grouping (₹50,000) because that
 * is how every bank statement, ATM and UPI app in the country renders them.
 */

export type WarningKey = "over_surplus" | "long_horizon";

export interface Phrases {
  greeting: (name: string) => string;
  questions: Record<DiscoverySlot, string>;
  reasks: Record<DiscoverySlot, string>;
  describe: Record<DiscoverySlot, (v: unknown) => string>;
  warn: Record<WarningKey, (stated?: number, surplus?: number) => string>;
  confirm: (parts: string) => string;
  confirmed: string;
  fixThat: string;
  notUnderstood: string;
  moveOn: string;
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

const RISK_WORDS: Record<string, Record<RiskProfile, string>> = {
  "en-IN": { conservative: "conservative", moderate: "moderate", aggressive: "aggressive" },
  "hi-IN": { conservative: "सुरक्षित", moderate: "संतुलित", aggressive: "आक्रामक" },
  "mr-IN": { conservative: "सुरक्षित", moderate: "संतुलित", aggressive: "आक्रमक" },
  "ta-IN": { conservative: "பாதுகாப்பான", moderate: "சமநிலையான", aggressive: "தீவிரமான" },
  "te-IN": { conservative: "సురక్షితమైన", moderate: "సమతుల్య", aggressive: "దూకుడైన" },
  "bn-IN": { conservative: "নিরাপদ", moderate: "ভারসাম্যপূর্ণ", aggressive: "আক্রমণাত্মক" },
};

const risk = (lang: string, v: unknown) =>
  RISK_WORDS[lang]?.[v as RiskProfile] ?? RISK_WORDS["en-IN"][v as RiskProfile] ?? String(v);

const EN: Phrases = {
  greeting: (name) =>
    `Hello ${name}. Before I suggest anything, I would like to understand what you are planning for.`,
  questions: {
    shortTermGoals: "What do you need money for in the next two or three years?",
    longTermGoals: "And further out — what are you building towards?",
    horizonYears: "How many years do you want to give this?",
    targetCorpus: "How much would you like to have at the end of it?",
    monthlyInvestable: "How much can you set aside each month?",
    annualStepUpPct: "Can you increase that a little each year, as your income grows?",
    riskAppetite:
      "If your investments dropped fifteen percent in a bad month, would you sell, wait, or buy more?",
    liquidityBufferMonths: "How many months of expenses would you want to keep within reach?",
  },
  reasks: {
    shortTermGoals: "For example a car, a trip, or an emergency fund — what is coming up soon?",
    longTermGoals: "Retirement, a home, your children's education — what matters most?",
    horizonYears: "Roughly how long — five years, ten, twenty?",
    targetCorpus: "A rough figure is fine — fifty lakh, one crore?",
    monthlyInvestable: "Whatever you can manage comfortably — what monthly amount?",
    annualStepUpPct:
      "Even five or ten percent a year makes a large difference — what feels realistic?",
    riskAppetite: "Would a sharp fall worry you, or would you sit through it?",
    liquidityBufferMonths: "Most people keep three to six months — what would let you sleep at night?",
  },
  describe: {
    shortTermGoals: (v) => list(v) || "nothing in the short term",
    longTermGoals: (v) => list(v) || "no long-term goal stated",
    horizonYears: (v) => `${v} years`,
    targetCorpus: (v) => inr(v as number),
    monthlyInvestable: (v) => `${inr(v as number)} a month`,
    annualStepUpPct: (v) => (Number(v) > 0 ? `stepping up ${v}% a year` : "no annual step-up"),
    riskAppetite: (v) => `a ${risk("en-IN", v)} risk profile`,
    liquidityBufferMonths: (v) => `${v} months of expenses kept liquid`,
  },
  warn: {
    over_surplus: (stated, surplus) =>
      `You said ${inr(stated!)} a month, and your account suggests about ${inr(surplus!)} is spare. I will plan with your number — tell me if you would rather I used the smaller one.`,
    long_horizon: () =>
      "That is a very long horizon — I will plan for it, but let us revisit it as you get closer.",
  },
  confirm: (parts) =>
    `Let me confirm what I understood. You are planning for ${parts}. Have I got that right?`,
  confirmed: "Thank you. I have your plan. Let me take it to the committee.",
  fixThat: "Let us fix that.",
  notUnderstood: "Sorry — is that plan right? Please say yes or no.",
  moveOn: "No problem, let us move on.",
};

const HI: Phrases = {
  greeting: (name) =>
    `नमस्ते ${name}। कुछ सुझाने से पहले मैं समझना चाहूँगी कि आप किस चीज़ के लिए योजना बना रहे हैं।`,
  questions: {
    shortTermGoals: "अगले दो-तीन साल में आपको किस चीज़ के लिए पैसों की ज़रूरत है?",
    longTermGoals: "और आगे चलकर — आप किस चीज़ के लिए जोड़ रहे हैं?",
    horizonYears: "आप इसके लिए कितने साल देना चाहेंगे?",
    targetCorpus: "उस समय तक आपके पास कितनी रकम होनी चाहिए?",
    monthlyInvestable: "हर महीने आप कितना अलग रख सकते हैं?",
    annualStepUpPct: "जैसे-जैसे आमदनी बढ़े, क्या आप हर साल इसमें थोड़ा इज़ाफ़ा कर सकते हैं?",
    riskAppetite:
      "अगर किसी बुरे महीने में आपका निवेश पंद्रह प्रतिशत गिर जाए, तो आप बेचेंगे, इंतज़ार करेंगे, या और ख़रीदेंगे?",
    liquidityBufferMonths: "कितने महीनों का ख़र्च आप हाथ में रखना चाहेंगे?",
  },
  reasks: {
    shortTermGoals: "जैसे गाड़ी, कोई यात्रा, या इमरजेंसी फंड — नज़दीक में क्या आ रहा है?",
    longTermGoals: "रिटायरमेंट, घर, बच्चों की पढ़ाई — सबसे ज़्यादा क्या मायने रखता है?",
    horizonYears: "मोटे तौर पर कितना समय — पाँच साल, दस, बीस?",
    targetCorpus: "अंदाज़ा भी चलेगा — पचास लाख, एक करोड़?",
    monthlyInvestable: "जितना आराम से हो सके — हर महीने कितनी रकम?",
    annualStepUpPct: "पाँच या दस प्रतिशत भी बड़ा फ़र्क़ डालता है — कितना ठीक लगेगा?",
    riskAppetite: "तेज़ गिरावट से आपको चिंता होगी, या आप टिके रहेंगे?",
    liquidityBufferMonths: "ज़्यादातर लोग तीन से छह महीने रखते हैं — किससे आपको चैन मिलेगा?",
  },
  describe: {
    shortTermGoals: (v) => list(v) || "फ़िलहाल कुछ नहीं",
    longTermGoals: (v) => list(v) || "कोई लंबी अवधि का लक्ष्य नहीं",
    horizonYears: (v) => `${v} साल`,
    targetCorpus: (v) => inr(v as number),
    monthlyInvestable: (v) => `${inr(v as number)} हर महीने`,
    annualStepUpPct: (v) => (Number(v) > 0 ? `हर साल ${v}% की बढ़ोतरी` : "कोई सालाना बढ़ोतरी नहीं"),
    riskAppetite: (v) => `${risk("hi-IN", v)} जोखिम प्रोफ़ाइल`,
    liquidityBufferMonths: (v) => `${v} महीनों का ख़र्च नकद में`,
  },
  warn: {
    over_surplus: (stated, surplus) =>
      `आपने ${inr(stated!)} हर महीने कहा, और आपके खाते के हिसाब से लगभग ${inr(surplus!)} बचता है। मैं आपकी बताई रकम से ही योजना बनाऊँगी — अगर कम रकम लेनी हो तो बता दीजिए।`,
    long_horizon: () =>
      "यह काफ़ी लंबी अवधि है — मैं इसी के हिसाब से योजना बनाऊँगी, पर समय नज़दीक आने पर इसे दोबारा देखेंगे।",
  },
  confirm: (parts) => `मैं दोहरा देती हूँ। आप ${parts} के लिए योजना बना रहे हैं। क्या यह सही है?`,
  confirmed: "धन्यवाद। आपकी योजना मेरे पास है। अब मैं इसे कमेटी के पास ले जाती हूँ।",
  fixThat: "चलिए इसे ठीक करते हैं।",
  notUnderstood: "माफ़ कीजिए — क्या यह योजना सही है? कृपया हाँ या ना कहें।",
  moveOn: "कोई बात नहीं, आगे बढ़ते हैं।",
};

const MR: Phrases = {
  greeting: (name) =>
    `नमस्कार ${name}. काही सुचवण्याआधी तुम्ही कशासाठी नियोजन करताय हे मला समजून घ्यायचं आहे.`,
  questions: {
    shortTermGoals: "पुढच्या दोन-तीन वर्षांत तुम्हाला कशासाठी पैसे लागणार आहेत?",
    longTermGoals: "आणि पुढे जाऊन — तुम्ही कशासाठी साठवताय?",
    horizonYears: "यासाठी तुम्ही किती वर्षं देऊ इच्छिता?",
    targetCorpus: "शेवटी तुमच्याकडे किती रक्कम असावी असं वाटतं?",
    monthlyInvestable: "दर महिन्याला तुम्ही किती बाजूला ठेवू शकता?",
    annualStepUpPct: "उत्पन्न वाढेल तसं दरवर्षी थोडं वाढवू शकाल का?",
    riskAppetite:
      "एखाद्या वाईट महिन्यात तुमची गुंतवणूक पंधरा टक्के घसरली, तर तुम्ही विकाल, थांबाल, की आणखी घ्याल?",
    liquidityBufferMonths: "किती महिन्यांचा खर्च तुम्हाला हाताशी ठेवायचा आहे?",
  },
  reasks: {
    shortTermGoals: "उदाहरणार्थ गाडी, सहल, किंवा इमर्जन्सी फंड — लवकरच काय येतंय?",
    longTermGoals: "निवृत्ती, घर, मुलांचं शिक्षण — सर्वात महत्त्वाचं काय?",
    horizonYears: "साधारण किती काळ — पाच वर्षं, दहा, वीस?",
    targetCorpus: "अंदाजे सांगितलं तरी चालेल — पन्नास लाख, एक कोटी?",
    monthlyInvestable: "जेवढं सहज जमेल तेवढं — महिन्याला किती?",
    annualStepUpPct: "पाच-दहा टक्केही मोठा फरक करतात — किती जमेल असं वाटतं?",
    riskAppetite: "मोठ्या घसरणीने तुम्हाला काळजी वाटेल, की तुम्ही टिकून राहाल?",
    liquidityBufferMonths: "बहुतेक लोक तीन ते सहा महिने ठेवतात — तुम्हाला कशाने निश्चिंत वाटेल?",
  },
  describe: {
    shortTermGoals: (v) => list(v) || "सध्या काही नाही",
    longTermGoals: (v) => list(v) || "दीर्घ मुदतीचं ध्येय सांगितलं नाही",
    horizonYears: (v) => `${v} वर्षं`,
    targetCorpus: (v) => inr(v as number),
    monthlyInvestable: (v) => `${inr(v as number)} दर महिन्याला`,
    annualStepUpPct: (v) => (Number(v) > 0 ? `दरवर्षी ${v}% वाढ` : "दरवर्षी वाढ नाही"),
    riskAppetite: (v) => `${risk("mr-IN", v)} जोखीम प्रोफाइल`,
    liquidityBufferMonths: (v) => `${v} महिन्यांचा खर्च रोख`,
  },
  warn: {
    over_surplus: (stated, surplus) =>
      `तुम्ही महिन्याला ${inr(stated!)} म्हणालात, आणि तुमच्या खात्यानुसार सुमारे ${inr(surplus!)} शिल्लक राहते. मी तुमचाच आकडा वापरेन — कमी रक्कम घ्यायची असल्यास सांगा.`,
    long_horizon: () =>
      "हा बराच मोठा कालावधी आहे — मी त्यानुसारच नियोजन करेन, पण वेळ जवळ आल्यावर पुन्हा पाहूया.",
  },
  confirm: (parts) => `मी पुन्हा सांगते. तुम्ही ${parts} साठी नियोजन करताय. हे बरोबर आहे ना?`,
  confirmed: "धन्यवाद. तुमची योजना माझ्याकडे आहे. आता मी ती समितीकडे नेते.",
  fixThat: "चला ते दुरुस्त करूया.",
  notUnderstood: "माफ करा — ही योजना बरोबर आहे का? कृपया होय किंवा नाही म्हणा.",
  moveOn: "हरकत नाही, पुढे जाऊया.",
};

const TA: Phrases = {
  greeting: (name) =>
    `வணக்கம் ${name}. எதையும் பரிந்துரைப்பதற்கு முன், நீங்கள் எதற்குத் திட்டமிடுகிறீர்கள் என்பதைப் புரிந்துகொள்ள விரும்புகிறேன்.`,
  questions: {
    shortTermGoals: "அடுத்த இரண்டு மூன்று ஆண்டுகளில் உங்களுக்கு எதற்குப் பணம் தேவை?",
    longTermGoals: "இன்னும் தொலைவில் — நீங்கள் எதற்காகச் சேமிக்கிறீர்கள்?",
    horizonYears: "இதற்கு எத்தனை ஆண்டுகள் ஒதுக்க விரும்புகிறீர்கள்?",
    targetCorpus: "அதன் முடிவில் உங்களிடம் எவ்வளவு தொகை இருக்க வேண்டும்?",
    monthlyInvestable: "ஒவ்வொரு மாதமும் எவ்வளவு ஒதுக்க முடியும்?",
    annualStepUpPct: "வருமானம் உயரும்போது ஆண்டுதோறும் இதைச் சிறிது அதிகரிக்க முடியுமா?",
    riskAppetite:
      "ஒரு மோசமான மாதத்தில் உங்கள் முதலீடு பதினைந்து சதவீதம் குறைந்தால், விற்பீர்களா, காத்திருப்பீர்களா, அல்லது மேலும் வாங்குவீர்களா?",
    liquidityBufferMonths: "எத்தனை மாத செலவுகளைக் கையில் வைத்திருக்க விரும்புகிறீர்கள்?",
  },
  reasks: {
    shortTermGoals: "உதாரணமாக ஒரு கார், பயணம், அல்லது அவசரகால நிதி — விரைவில் என்ன வருகிறது?",
    longTermGoals: "ஓய்வூதியம், வீடு, குழந்தைகளின் படிப்பு — எது மிக முக்கியம்?",
    horizonYears: "தோராயமாக எவ்வளவு காலம் — ஐந்து ஆண்டுகள், பத்து, இருபது?",
    targetCorpus: "தோராயமான எண் போதும் — ஐம்பது லட்சம், ஒரு கோடி?",
    monthlyInvestable: "வசதியாக எவ்வளவு முடியுமோ அவ்வளவு — மாதம் எவ்வளவு?",
    annualStepUpPct: "ஐந்து அல்லது பத்து சதவீதம் கூட பெரிய மாற்றத்தை ஏற்படுத்தும் — எவ்வளவு சாத்தியம்?",
    riskAppetite: "கூர்மையான வீழ்ச்சி உங்களைக் கவலைப்படுத்துமா, அல்லது பொறுத்திருப்பீர்களா?",
    liquidityBufferMonths:
      "பெரும்பாலானோர் மூன்று முதல் ஆறு மாதங்கள் வைத்திருப்பார்கள் — உங்களுக்கு எது நிம்மதி தரும்?",
  },
  describe: {
    shortTermGoals: (v) => list(v) || "தற்போது எதுவும் இல்லை",
    longTermGoals: (v) => list(v) || "நீண்டகால இலக்கு சொல்லப்படவில்லை",
    horizonYears: (v) => `${v} ஆண்டுகள்`,
    targetCorpus: (v) => inr(v as number),
    monthlyInvestable: (v) => `மாதம் ${inr(v as number)}`,
    annualStepUpPct: (v) => (Number(v) > 0 ? `ஆண்டுக்கு ${v}% அதிகரிப்பு` : "ஆண்டு அதிகரிப்பு இல்லை"),
    riskAppetite: (v) => `${risk("ta-IN", v)} இடர் சுயவிவரம்`,
    liquidityBufferMonths: (v) => `${v} மாத செலவுகள் கையிருப்பில்`,
  },
  warn: {
    over_surplus: (stated, surplus) =>
      `நீங்கள் மாதம் ${inr(stated!)} என்றீர்கள், உங்கள் கணக்குப்படி சுமார் ${inr(surplus!)} மிச்சம் இருக்கிறது. நான் உங்கள் எண்ணிக்கையுடனேயே திட்டமிடுவேன் — குறைவான தொகையை எடுக்க வேண்டுமானால் சொல்லுங்கள்.`,
    long_horizon: () =>
      "இது மிக நீண்ட காலம் — அதற்கேற்பவே திட்டமிடுவேன், ஆனால் நெருங்கும்போது மீண்டும் பார்ப்போம்.",
  },
  confirm: (parts) =>
    `நான் உறுதிப்படுத்துகிறேன். நீங்கள் ${parts} திட்டமிடுகிறீர்கள். இது சரியா?`,
  confirmed: "நன்றி. உங்கள் திட்டம் என்னிடம் உள்ளது. இப்போது அதைக் குழுவிடம் கொண்டு செல்கிறேன்.",
  fixThat: "அதைச் சரிசெய்வோம்.",
  notUnderstood: "மன்னிக்கவும் — இந்தத் திட்டம் சரியா? ஆம் அல்லது இல்லை என்று சொல்லுங்கள்.",
  moveOn: "பரவாயில்லை, அடுத்ததற்குச் செல்வோம்.",
};

const TE: Phrases = {
  greeting: (name) =>
    `నమస్కారం ${name}. ఏదైనా సూచించే ముందు మీరు దేని కోసం ప్రణాళిక వేస్తున్నారో తెలుసుకోవాలనుకుంటున్నాను.`,
  questions: {
    shortTermGoals: "వచ్చే రెండు మూడు సంవత్సరాలలో మీకు దేనికి డబ్బు అవసరం?",
    longTermGoals: "ఇంకా ముందుకు — మీరు దేని కోసం పొదుపు చేస్తున్నారు?",
    horizonYears: "దీనికి మీరు ఎన్ని సంవత్సరాలు ఇవ్వాలనుకుంటున్నారు?",
    targetCorpus: "చివరికి మీ దగ్గర ఎంత మొత్తం ఉండాలని అనుకుంటున్నారు?",
    monthlyInvestable: "ప్రతి నెలా మీరు ఎంత పక్కన పెట్టగలరు?",
    annualStepUpPct: "ఆదాయం పెరిగే కొద్దీ ప్రతి సంవత్సరం దీన్ని కొంచెం పెంచగలరా?",
    riskAppetite:
      "ఒక చెడ్డ నెలలో మీ పెట్టుబడి పదిహేను శాతం పడిపోతే, మీరు అమ్ముతారా, వేచి ఉంటారా, లేక ఇంకా కొంటారా?",
    liquidityBufferMonths: "ఎన్ని నెలల ఖర్చులు చేతిలో ఉంచుకోవాలని అనుకుంటున్నారు?",
  },
  reasks: {
    shortTermGoals: "ఉదాహరణకు కారు, ప్రయాణం, లేదా అత్యవసర నిధి — త్వరలో ఏమి వస్తోంది?",
    longTermGoals: "పదవీ విరమణ, ఇల్లు, పిల్లల చదువు — ఏది ఎక్కువ ముఖ్యం?",
    horizonYears: "సుమారుగా ఎంత కాలం — ఐదు సంవత్సరాలు, పది, ఇరవై?",
    targetCorpus: "సుమారు అంకె చాలు — యాభై లక్షలు, ఒక కోటి?",
    monthlyInvestable: "సౌకర్యంగా ఎంత వీలైతే అంత — నెలకు ఎంత?",
    annualStepUpPct: "ఐదు లేదా పది శాతం కూడా పెద్ద తేడా చూపిస్తుంది — ఎంత సాధ్యం?",
    riskAppetite: "పెద్ద పతనం మిమ్మల్ని ఆందోళనకు గురిచేస్తుందా, లేక మీరు నిలబడతారా?",
    liquidityBufferMonths: "చాలామంది మూడు నుండి ఆరు నెలలు ఉంచుకుంటారు — మీకు దేనితో నిశ్చింత?",
  },
  describe: {
    shortTermGoals: (v) => list(v) || "ప్రస్తుతం ఏమీ లేదు",
    longTermGoals: (v) => list(v) || "దీర్ఘకాలిక లక్ష్యం చెప్పలేదు",
    horizonYears: (v) => `${v} సంవత్సరాలు`,
    targetCorpus: (v) => inr(v as number),
    monthlyInvestable: (v) => `నెలకు ${inr(v as number)}`,
    annualStepUpPct: (v) => (Number(v) > 0 ? `ఏటా ${v}% పెంపు` : "ఏటా పెంపు లేదు"),
    riskAppetite: (v) => `${risk("te-IN", v)} రిస్క్ ప్రొఫైల్`,
    liquidityBufferMonths: (v) => `${v} నెలల ఖర్చులు చేతిలో`,
  },
  warn: {
    over_surplus: (stated, surplus) =>
      `మీరు నెలకు ${inr(stated!)} అన్నారు, మీ ఖాతా ప్రకారం సుమారు ${inr(surplus!)} మిగులుతుంది. నేను మీ సంఖ్యతోనే ప్రణాళిక వేస్తాను — తక్కువ మొత్తం తీసుకోవాలంటే చెప్పండి.`,
    long_horizon: () =>
      "ఇది చాలా దీర్ఘకాలం — దానికి తగ్గట్టే ప్రణాళిక వేస్తాను, కానీ సమయం దగ్గరపడినప్పుడు మళ్లీ చూద్దాం.",
  },
  confirm: (parts) =>
    `నేను మరోసారి చెబుతాను. మీరు ${parts} కోసం ప్రణాళిక వేస్తున్నారు. ఇది సరైనదేనా?`,
  confirmed: "ధన్యవాదాలు. మీ ప్రణాళిక నా దగ్గర ఉంది. ఇప్పుడు దాన్ని కమిటీకి తీసుకువెళ్తాను.",
  fixThat: "దాన్ని సరిచేద్దాం.",
  notUnderstood: "క్షమించండి — ఈ ప్రణాళిక సరైనదేనా? దయచేసి అవును లేదా కాదు అని చెప్పండి.",
  moveOn: "పర్వాలేదు, ముందుకు వెళ్దాం.",
};

const BN: Phrases = {
  greeting: (name) =>
    `নমস্কার ${name}। কিছু বলার আগে আমি বুঝে নিতে চাই আপনি কীসের পরিকল্পনা করছেন।`,
  questions: {
    shortTermGoals: "আগামী দুই-তিন বছরে আপনার কীসের জন্য টাকা দরকার?",
    longTermGoals: "আর আরও পরে — আপনি কীসের জন্য গড়ে তুলছেন?",
    horizonYears: "এর জন্য কত বছর সময় দিতে চান?",
    targetCorpus: "শেষে আপনার কাছে কত টাকা থাকলে ভালো হয়?",
    monthlyInvestable: "প্রতি মাসে আপনি কত টাকা সরিয়ে রাখতে পারবেন?",
    annualStepUpPct: "আয় বাড়ার সঙ্গে প্রতি বছর একটু বাড়াতে পারবেন?",
    riskAppetite:
      "খারাপ কোনও মাসে আপনার বিনিয়োগ পনেরো শতাংশ পড়ে গেলে, আপনি বেচবেন, অপেক্ষা করবেন, নাকি আরও কিনবেন?",
    liquidityBufferMonths: "কত মাসের খরচ হাতের কাছে রাখতে চান?",
  },
  reasks: {
    shortTermGoals: "যেমন একটা গাড়ি, বেড়ানো, বা জরুরি তহবিল — সামনে কী আসছে?",
    longTermGoals: "অবসর, বাড়ি, ছেলেমেয়ের পড়াশোনা — কোনটা সবচেয়ে জরুরি?",
    horizonYears: "মোটামুটি কত সময় — পাঁচ বছর, দশ, কুড়ি?",
    targetCorpus: "আন্দাজে বললেও চলবে — পঞ্চাশ লাখ, এক কোটি?",
    monthlyInvestable: "যতটা স্বচ্ছন্দে পারেন — মাসে কত?",
    annualStepUpPct: "পাঁচ কি দশ শতাংশও অনেক তফাত গড়ে দেয় — কতটা সম্ভব?",
    riskAppetite: "বড় পতনে আপনি চিন্তায় পড়বেন, নাকি ধরে রাখবেন?",
    liquidityBufferMonths: "বেশিরভাগ লোক তিন থেকে ছয় মাস রাখেন — কীসে আপনার নিশ্চিন্ত লাগবে?",
  },
  describe: {
    shortTermGoals: (v) => list(v) || "এখনই কিছু নয়",
    longTermGoals: (v) => list(v) || "দীর্ঘমেয়াদি লক্ষ্য বলা হয়নি",
    horizonYears: (v) => `${v} বছর`,
    targetCorpus: (v) => inr(v as number),
    monthlyInvestable: (v) => `মাসে ${inr(v as number)}`,
    annualStepUpPct: (v) => (Number(v) > 0 ? `প্রতি বছর ${v}% বৃদ্ধি` : "বার্ষিক বৃদ্ধি নেই"),
    riskAppetite: (v) => `${risk("bn-IN", v)} ঝুঁকির ধরন`,
    liquidityBufferMonths: (v) => `${v} মাসের খরচ হাতে`,
  },
  warn: {
    over_surplus: (stated, surplus) =>
      `আপনি মাসে ${inr(stated!)} বলেছেন, আর আপনার অ্যাকাউন্ট বলছে প্রায় ${inr(surplus!)} বাড়তি থাকে। আমি আপনার বলা অঙ্কেই পরিকল্পনা করব — কম নিতে চাইলে বলুন।`,
    long_horizon: () =>
      "এটা বেশ লম্বা সময় — সেইমতোই পরিকল্পনা করব, তবে সময় এগিয়ে এলে আবার দেখে নেব।",
  },
  confirm: (parts) => `আমি একবার মিলিয়ে নিই। আপনি ${parts} পরিকল্পনা করছেন। ঠিক বললাম তো?`,
  confirmed: "ধন্যবাদ। আপনার পরিকল্পনা আমার কাছে আছে। এবার এটা কমিটির কাছে নিয়ে যাচ্ছি।",
  fixThat: "চলুন ঠিক করে নিই।",
  notUnderstood: "মাফ করবেন — এই পরিকল্পনা ঠিক আছে? হ্যাঁ বা না বলুন।",
  moveOn: "কোনও অসুবিধা নেই, এগিয়ে যাই।",
};

const ALL: Record<string, Phrases> = {
  "en-IN": EN,
  "hi-IN": HI,
  "mr-IN": MR,
  "ta-IN": TA,
  "te-IN": TE,
  "bn-IN": BN,
};

export const SUPPORTED_LANGUAGES = Object.keys(ALL);

/** English when we do not have the language — never a half-translated mix. */
export function phrases(language: string | undefined): Phrases {
  return ALL[language ?? ""] ?? EN;
}
