/* ==========================================================================
   data.js — sav sadržaj aplikacije na jednom mjestu
   --------------------------------------------------------------------------
   Arapski tekst se nikad ne izmišlja niti rekonstruiše iz transliteracije.
   Unesen je tačno onako kako je dostavljen.

   POLJA:
     id             obavezno i stabilno — po njemu se pamti checkbox.
                    Naslov (npr. "#7") smiješ mijenjati koliko hoćeš,
                    id ne diraj jer se gubi ranije čekiranje.
     title          naslov u listi
     type           "dua" | "surah" | "count" | "divider"
     arabic         string ILI niz stringova (svaki element = svoj pasus).
                    "\n" unutar stringa = prelom reda (kraj ajeta).
     translation    prevod na bosanski — prikazuje se ispod arapskog
     source         izvor dove — Kur'an ili hadis
     repetitions    opciono, prikazuje se kao "50x"

   POLJA SEKCIJE (niz `sections` na dnu fajla):
     days           opciono; dani sedmice u kojima sekcija postoji
                    (0 = nedjelja … 5 = petak). Bez njega — svaki dan.
   ŠTA KORISNIK SMIJE ISKLJUČITI. Pojedinu stavku, u postavkama (spisak
   kvačica po sekciji). To se NE piše ovdje ni jednim poljem: config nosi
   `skriveno`, spisak id-eva, a sve što nije na njemu se prikazuje — pa nova
   dova u ovom fajlu sama uđe u spisak i ne treba je nigdje dopisivati.
   Isključena stavka ispada i iz računa podsjetnika, jer i server prolazi
   kroz `sectionsForDate()`; sekcija kojoj je isključeno sve nestaje sama.

   Kur'anska stranica je i sama takva stavka, pod id-em "quran" — nije u
   nizu `items` (vidi `sectionItems()`), ali se isključuje isto kao dova.

   Prekidač u postavkama nema svoje polje u configu: pali i gasi sve kvačice
   sekcije odjednom, pa se ne može raziće sa njima.

   TIPOVI:
     "surah"   -> samo checkbox + naslov, bez teksta (sve sure)
     "count"   -> checkbox + naslov + broj ponavljanja, bez teksta
     "dua"     -> checkbox + naslov + arapski + prevod

   Naslov dove se ne piše ovdje — aplikacija ih sama numeriše po sekciji
   ("DOVA #1", "DOVA #2", ...). `title` je bitan samo za "surah" i "count".

   TRANSLITERACIJA. Svaka dova je ima, i ona je zamjena za arapski, nikad
   dodatak: kad korisnik u svom configu upali "transkripcija", ispod naslova
   stoji `transliteration` umjesto `arabic`. Prevod ide ispod u oba slučaja.
   Bez tog prekidača se ne prikazuje.

   Pravila po kojima je pisana, da nova dova ne ispadne iz reda:
     ج → dž,  ش → š,  خ → h,  ذ/ظ → z,  ث → s,  ح/ه → h
     ع i ء   → apostrof: 'abduke, e'uzu, ni'metike, šej'un
     fetha   → e (Ente, ene, minel-hemmi), ali a uz emfatike
               (Rabba, sana'tu, kahrir-ridžal)
     و       → ve; član se spaja: vel-hazen, bil-islami, fil-erdi
     sunčeva slova asimilirana i spojena crticom: jagfiruz-zunube,
       galebetid-dejn, Huves-Semi'ul-'Alim. Asimilira se SAMO član — ostalo
       se piše rastavljeno ("ve in lem", ne "ve il-lem"), da se čita lakše.
     velika slova za Allahova imena i zamjenice: Ente, Rabbi, Huve
     bez dužinskih znakova (nikakvo ā/ī/ū)
     kraj dove je u pauznom obliku ('azaben-nar), sredina u vezanom
     više pasusa arapskog → jedan tok teksta, kao što se i arapski prikazuje
   ========================================================================== */

/* --------------------------------------------------------------------------
   ZIKR
   Sve stavke su "count" — samo naslov + broj ponavljanja, bez arapskog teksta.
   -------------------------------------------------------------------------- */
   const zikr = [
    { id: "zikr-salavat-50",       title: "Salavat",                     type: "count", repetitions: 30 },
    { id: "zikr-estagfirullah-10", title: "Estagfirullah",               type: "count", repetitions: 10 },
    { id: "zikr-elhamdulillah-10", title: "Elhamdulillah",               type: "count", repetitions: 10 },
    { id: "zikr-hasbunallah-10",   title: "Hasbunallahu ve ni'mel-vekil", type: "count", repetitions: 10 }
  ];
  
  /* --------------------------------------------------------------------------
     DOVE
     Prvo imenovane dove, pa granična linija, pa numerisani spisak (#1 … #39).
     Numeracija je samo `title` — redoslijed mijenjaš premještanjem objekata.
     -------------------------------------------------------------------------- */
  const dove = [
    {
      id: "dove-fatiha",
      title: "Fatiha",
      type: "surah",
      source: "Kur'an, El-Fatiha"
    },
    {
      id: "dove-reditu-billahi",
      title: "Reditu billahi Rabba...",
      type: "dua",
      arabic: "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا وَرَسُولًا",
      transliteration:
        "Reditu billahi Rabba, ve bil-islami dina, ve bi Muhammedin " +
        "sallallahu alejhi ve sellem nebijjen ve resula.",
      translation: "Zadovoljan sam Allahom kao Gospodarom, islamom kao vjerom i Muhammedom, sallallahu alejhi ve sellem, kao vjerovjesnikom i poslanikom.",
      source: "Hadis — Sahih Muslim, 1884"
    },
    {
      id: "dove-sejjidul-istigfar",
      title: "Allahumme Ente Rabbi...",
      type: "dua",
      arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي، فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
      transliteration:
        "Allahumme Ente Rabbi, la ilahe illa Ente, halakteni ve ene 'abduke, " +
        "ve ene 'ala 'ahdike ve va'dike mesteta'tu. E'uzu bike min šerri ma sana'tu, " +
        "ebu'u leke bi ni'metike 'alejje, ve ebu'u bi zenbi, fagfir li, " +
        "fe innehu la jagfiruz-zunube illa Ente.",
      translation: "Allahu, Ti si moj Gospodar, nema boga osim Tebe. Ti si me stvorio i ja sam Tvoj rob. Ja sam na zavjetu i obećanju Tvome koliko mogu. Utječem Ti se od zla onoga što sam učinio. Priznajem Tvoju blagodat prema meni i priznajem svoj grijeh, pa mi oprosti, jer grijehe niko osim Tebe ne oprašta.",
      source: "Hadis — Sahih al-Bukhari, 6306"
    },
    {
      id: "dove-hemm-hazen",
      title: "Allahumme inni e'uzu bike...",
      type: "dua",
      arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَغَلَبَةِ الدَّيْنِ وَقَهْرِ الرِّجَالِ",
      transliteration:
        "Allahumme inni e'uzu bike minel-hemmi vel-hazen, vel-'ajzi vel-kesel, " +
        "vel-buhl vel-džubn, ve galebetid-dejn ve kahrir-ridžal.",
      translation: "Gospodaru moj, utječem Ti se od brige i tuge, od nemoći i lijenosti, od kukavičluka i škrtosti, od tereta duga i od toga da me ljudi savladaju.",
      source: "Hadis — Sahih al-Bukhari, 6369"
    },
  
    {
      id: "dova-a2",
      title: "#1",
      type: "dua",
      arabic: "رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ",
      transliteration:
        "Rabbena tekabbel minna, inneke Entes-Semi'ul-'Alim.",
      translation: "Gospodaru naš, primi od nas! Zaista Ti sve čuješ i sve znaš.",
      source: "Kur'an, 2:127"
    },
    {
      id: "dova-a3",
      title: "#2",
      type: "dua",
      arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
      transliteration:
        "Rabbena atina fid-dunja haseneten ve fil-ahireti haseneten ve kina " +
        "'azaben-nar.",
      translation: "Gospodaru naš, daj nam dobro na ovom svijetu i dobro na budućem svijetu i sačuvaj nas kazne Džehennema.",
      source: "Kur'an, 2:201"
    },
    {
      id: "dova-a4",
      title: "#3",
      type: "dua",
      arabic: "رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ",
      transliteration:
        "Rabbena efrig 'alejna sabren ve sebbit akdamena vensurna " +
        "'alel-kavmil-kafirin.",
      translation: "Gospodaru naš, obaspi nas strpljivošću, učvrsti naše noge i pomozi nam protiv naroda nevjerničkog.",
      source: "Kur'an, 2:250"
    },
    {
      id: "dova-a6",
      title: "#5",
      type: "dua",
      arabic: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً ۚ إِنَّكَ أَنْتَ الْوَهَّابُ",
      transliteration:
        "Rabbena la tuzig kulubena ba'de iz hedejtena ve heb lena min " +
        "ledunke rahmeten, inneke Entel-Vehhab.",
      translation: "Gospodaru naš, ne dopusti da naša srca skrenu nakon što si nas uputio i daruj nam od Sebe milost. Zaista, Ti si Onaj Koji mnogo daruje.",
      source: "Kur'an, 3:8"
    },
    {
      id: "dova-a7",
      title: "#6",
      type: "dua",
      arabic: "رَبَّنَا إِنَّنَا آمَنَّا فَاغْفِرْ لَنَا ذُنُوبَنَا وَقِنَا عَذَابَ النَّارِ",
      transliteration:
        "Rabbena innena amenna fagfir lena zunubena ve kina 'azaben-nar.",
      translation: "Gospodaru naš, mi smo vjerovali, pa nam oprosti grijehe naše i sačuvaj nas patnje u Vatri.",
      source: "Kur'an, 3:16"
    },
    {
      id: "dova-a8",
      title: "#7",
      type: "dua",
      arabic: [
        "قُلِ اللَّهُمَّ مَالِكَ الْمُلْكِ تُؤْتِي الْمُلْكَ مَنْ تَشَاءُ وَتَنْزِعُ الْمُلْكَ مِمَّنْ تَشَاءُ وَتُعِزُّ مَنْ تَشَاءُ وَتُذِلُّ مَنْ تَشَاءُ ۖ بِيَدِكَ الْخَيْرُ ۖ إِنَّكَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
        "تُولِجُ اللَّيْلَ فِي النَّهَارِ وَتُولِجُ النَّهَارَ فِي اللَّيْلِ وَتُخْرِجُ الْحَيَّ مِنَ الْمَيِّتِ وَتُخْرِجُ الْمَيِّتَ مِنَ الْحَيِّ وَتَرْزُقُ مَنْ تَشَاءُ بِغَيْرِ حِسَابٍ"
      ],
      transliteration:
        "Kulillahumme malikel-mulki tu'til-mulke men tešau ve " +
        "tenzi'ul-mulke mimmen tešau ve tu'izzu men tešau ve tuzillu men " +
        "tešau, bijedikel-hajr, inneke 'ala kulli šej'in kadir. " +
        "Tulidžul-lejle fin-nehari ve tulidžun-nehare fil-lejli ve " +
        "tuhridžul-hajje minel-mejjiti ve tuhridžul-mejjite minel-hajji ve " +
        "terzuku men tešau bigajri hisab.",
      translation: "Reci: 'Allahu, Gospodaru svega što postoji, Ti daješ vlast kome hoćeš, a oduzimaš vlast od koga hoćeš. Ti uzvisuješ koga hoćeš, a ponižavaš koga hoćeš. U Tvojoj ruci je svako dobro i Ti nad svime imaš moć. Ti uvodiš noć u dan i uvodiš dan u noć. Ti izvodiš živo iz mrtvog i izvodiš mrtvo iz živog. Ti opskrbljuješ koga hoćeš bez računa.'",
      source: "Kur'an, 3:26-27"
    },
    {
      id: "dova-a9",
      title: "#8",
      type: "dua",
      arabic: "رَبَّنَا آمَنَّا بِمَا أَنْزَلْتَ وَاتَّبَعْنَا الرَّسُولَ فَاكْتُبْنَا مَعَ الشَّاهِدِينَ",
      transliteration:
        "Rabbena amenna bima enzelte vettebe'ner-resule fektubna " +
        "me'aš-šahidin.",
      translation: "Gospodaru naš, vjerujemo u ono što si objavio i slijedimo Poslanika, pa nas upiši među svjedoke.",
      source: "Kur'an, 3:53"
    },
    {
      id: "dova-a10",
      title: "#9",
      type: "dua",
      arabic: "رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ",
      transliteration:
        "Rabbenagfir lena zunubena ve israfena fi emrina ve sebbit akdamena " +
        "vensurna 'alel-kavmil-kafirin.",
      translation: "Gospodaru naš, oprosti nam grijehe naše i pretjerivanje naše u poslovima našim, učvrsti naše noge i pomozi nam protiv naroda nevjerničkog.",
      source: "Kur'an, 3:147"
    },
    {
      id: "dova-a11",
      title: "#10",
      type: "dua",
      arabic: [
        "رَبَّنَا مَا خَلَقْتَ هَٰذَا بَاطِلًا سُبْحَانَكَ فَقِنَا عَذَابَ النَّارِ",
        "رَبَّنَا إِنَّكَ مَنْ تُدْخِلِ النَّارَ فَقَدْ أَخْزَيْتَهُ ۖ وَمَا لِلظَّالِمِينَ مِنْ أَنْصَارٍ",
        "رَبَّنَا إِنَّنَا سَمِعْنَا مُنَادِيًا يُنَادِي لِلْإِيمَانِ أَنْ آمِنُوا بِرَبِّكُمْ فَآمَنَّا ۚ رَبَّنَا فَاغْفِرْ لَنَا ذُنُوبَنَا وَكَفِّرْ عَنَّا سَيِّئَاتِنَا وَتَوَفَّنَا مَعَ الْأَبْرَارِ",
        "رَبَّنَا وَآتِنَا مَا وَعَدْتَنَا عَلَىٰ رُسُلِكَ وَلَا تُخْزِنَا يَوْمَ الْقِيَامَةِ ۗ إِنَّكَ لَا تُخْلِفُ الْمِيعَادَ"
      ],
      transliteration:
        "Rabbena ma halakte haza batilen, subhaneke fekina 'azaben-nar. " +
        "Rabbena inneke men tudhilin-nare fekad ahzejteh, ve ma " +
        "liz-zalimine min ensar. Rabbena innena semi'na munadijen junadi " +
        "lil-imani en aminu bi Rabbikum fe amenna, Rabbena fagfir lena " +
        "zunubena ve keffir 'anna sejjiatina ve teveffena me'al-ebrar. " +
        "Rabbena ve atina ma ve'adtena 'ala rusulike ve la tuhzina " +
        "jevmel-kijameh, inneke la tuhliful-mi'ad.",
      translation: "Gospodaru naš, Ti ovo nisi uzalud stvorio. Slavljen neka si Ti, pa nas sačuvaj kazne u Vatri. Gospodaru naš, koga Ti uvedeš u Vatru, Ti si ga ponizio, a nasilnicima nema pomagača. Gospodaru naš, mi smo čuli glasnika koji poziva vjeri: 'Vjerujte u Gospodara svoga!', pa smo vjerovali. Gospodaru naš, oprosti nam grijehe naše, poništi naša loša djela i usmrti nas s dobrima. Gospodaru naš, podari nam ono što si nam obećao preko Svojih poslanika i nemoj nas poniziti na Sudnjem danu. Zaista, Ti ne kršiš obećanje.",
      source: "Kur'an, 3:191-194"
    },
    {
      id: "dova-a12",
      title: "#11",
      type: "dua",
      arabic: "رَبَّنَا ظَلَمْنَا أَنْفُسَنَا وَإِنْ لَمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ الْخَاسِرِينَ",
      transliteration:
        "Rabbena zalemna enfusena ve in lem tagfir lena ve terhamna " +
        "lenekunenne minel-hasirin.",
      translation: "Gospodaru naš, sami smo sebi nepravdu učinili i ako nam Ti ne oprostiš i ne smiluješ nam se, sigurno ćemo biti među gubitnicima.",
      source: "Kur'an, 7:23"
    },
    {
      id: "dova-a13",
      title: "#12",
      type: "dua",
      arabic: "فَقَالُوا عَلَى اللَّهِ تَوَكَّلْنَا رَبَّنَا لَا تَجْعَلْنَا فِتْنَةً لِّلْقَوْمِ الظَّالِمِينَ ۝ وَنَجِّنَا بِرَحْمَتِكَ مِنَ الْقَوْمِ الْكَافِرِينَ",
      transliteration:
        "Fe kalu alellahi tevekkelna, rabbena la tedž'alna fitnetel-lil-kavmiz-zalimin. " +
        "Ve nedždžina bi rahmetike minel-kavmil-kafirin.",
      translation: "„I rekoše: ‘U Allaha se uzdamo! Gospodaru naš, ne učini nas predmetom kušnje narodu nasilničkom, i spasi nas Svojom milošću od naroda nevjerničkog.’“",
      source: "Kur'an, 10:85-86"
    },
    {
      id: "dova-a14",
      title: "#13",
      type: "dua",
      arabic: "فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ أَنْتَ وَلِيِّي فِي الدُّنْيَا وَالْآخِرَةِ ۖ تَوَفَّنِي مُسْلِمًا وَأَلْحِقْنِي بِالصَّالِحِينَ",
      transliteration:
        "Fatires-semavati vel-erdi Ente velijji fid-dunja vel-ahireh, " +
        "teveffeni muslimen ve elhikni bis-salihin.",
      translation: "Stvoritelju nebesa i Zemlje, Ti si moj zaštitnik na ovom i na budućem svijetu. Daj da umrem kao musliman i pridruži me dobrima.",
      source: "Kur'an, 12:101"
    },
    {
      id: "dova-a15",
      title: "#14",
      type: "dua",
      arabic: [
        "رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِنْ ذُرِّيَّتِي ۚ رَبَّنَا وَتَقَبَّلْ دُعَاءِ",
        "رَبَّنَا اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ"
      ],
      transliteration:
        "Rabbidž'alni mukimes-salati ve min zurrijjeti, Rabbena ve tekabbel " +
        "du'a. Rabbenagfir li ve li validejje ve lil-mu'minine jevme " +
        "jekumul-hisab.",
      translation: "Gospodaru moj, učini mene i potomstvo moje ustrajnima u obavljanju namaza. Gospodaru naš, primi moju dovu. Gospodaru naš, oprosti meni, mojim roditeljima i svim vjernicima na Dan kada se bude polagao račun.",
      source: "Kur'an, 14:40-41"
    },
    {
      id: "dova-a16",
      title: "#15",
      type: "dua",
      arabic: "رَبِّ أَدْخِلْنِي مُدْخَلَ صِدْقٍ وَأَخْرِجْنِي مُخْرَجَ صِدْقٍ وَاجْعَلْ لِي مِنْ لَدُنْكَ سُلْطَانًا نَصِيرًا",
      transliteration:
        "Rabbi edhilni mudhale sidkin ve ahridžni muhredže sidkin vedž'al " +
        "li min ledunke sultanen nasira.",
      translation: "Gospodaru moj, uvedi me na lijep način i izvedi me na lijep način i podari mi od Sebe snagu koja će mi pomoći.",
      source: "Kur'an, 17:80"
    },
    {
      id: "dova-a17",
      title: "#16",
      type: "dua",
      arabic: "رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا",
      transliteration:
        "Rabbena atina min ledunke rahmeten ve hejji' lena min emrina " +
        "rešeda.",
      translation: "Gospodaru naš, podari nam od Sebe milost i pripremi nam u našem poslu ono što je ispravno.",
      source: "Kur'an, 18:10"
    },
    {
      id: "dova-a18",
      title: "#17",
      type: "dua",
      arabic: "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
      transliteration:
        "La ilahe illa Ente, subhaneke inni kuntu minez-zalimin.",
      translation: "Nema boga osim Tebe, slavljen neka si Ti! Ja sam zaista bio među onima koji su sebi nepravdu učinili.",
      source: "Kur'an, 21:87"
    },
    {
      id: "dova-a19",
      title: "#18",
      type: "dua",
      arabic: "رَبِّ لَا تَذَرْنِي فَرْدًا وَأَنْتَ خَيْرُ الْوَارِثِينَ",
      transliteration:
        "Rabbi la tezerni ferden ve Ente hajrul-varisin.",
      translation: "Gospodaru moj, ne ostavljaj me samog, a Ti si najbolji nasljednik.",
      source: "Kur'an, 21:89"
    },
    {
      id: "dova-a20",
      title: "#19",
      type: "dua",
      arabic: "رَبِّ أَعُوذُ بِكَ مِنْ هَمَزَاتِ الشَّيَاطِينِ ۝\n" +
              "وَأَعُوذُ بِكَ رَبِّ أَنْ يَحْضُرُونِ",
      transliteration:
        "Rabbi e'uzu bike min hemezatiš-šejatin, ve e'uzu bike Rabbi en " +
        "jahdurun.",
      translation: "Gospodaru moj, utječem Ti se od šejtanskih došaptavanja i utječem Ti se, Gospodaru moj, da mi se približe.",
      source: "Kur'an, 23:97-98"
    },
    {
      id: "dova-a21",
      title: "#20",
      type: "dua",
      arabic: "رَبَّنَا اصْرِفْ عَنَّا عَذَابَ جَهَنَّمَ ۖ إِنَّ عَذَابَهَا كَانَ غَرَامًا ۝\n" +
              "إِنَّهَا سَاءَتْ مُسْتَقَرًّا وَمُقَامًا",
      transliteration:
        "Rabbenasrif 'anna 'azabe džehenneme, inne 'azabeha kane garama. " +
        "Inneha saet mustekarren ve mukama.",
      translation: "Gospodaru naš, odvrati od nas patnju Džehennema, jer je njegova patnja zaista neprekidna. On je ružno boravište i prebivalište.",
      source: "Kur'an, 25:65-66"
    },
    {
      id: "dova-a22",
      title: "#21",
      type: "dua",
      arabic: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا",
      transliteration:
        "Rabbena heb lena min ezvadžina ve zurrijjatina kurrete a'junin " +
        "vedž'alna lil-muttekine imama.",
      translation: "Gospodaru naš, podari nam u našim suprugama i našem potomstvu radost očiju i učini nas predvodnicima bogobojaznih.",
      source: "Kur'an, 25:74"
    },
    {
      id: "dova-a23",
      title: "#22",
      type: "dua",
      arabic: "رَبِّ هَبْ لِي حُكْمًا وَأَلْحِقْنِي بِالصَّالِحِينَ ۝\n" +
              "وَاجْعَلْ لِي لِسَانَ صِدْقٍ فِي الْآخِرِينَ ۝\n" +
              "وَاجْعَلْنِي مِنْ وَرَثَةِ جَنَّةِ النَّعِيمِ ۝\n" +
              "وَلَا تُخْزِنِي يَوْمَ يُبْعَثُونَ ۝\n" +
              "يَوْمَ لَا يَنْفَعُ مَالٌ وَلَا بَنُونَ ۝\n" +
              "إِلَّا مَنْ أَتَى اللَّهَ بِقَلْبٍ سَلِيمٍ",
      transliteration:
        "Rabbi heb li hukmen ve elhikni bis-salihin. Vedž'al li lisane " +
        "sidkin fil-ahirin. Vedž'alni min veraseti džennetin-ne'im. Ve la " +
        "tuhzini jevme jub'asun. Jevme la jenfe'u malun ve la benun. Illa " +
        "men etellahe bi kalbin selim.",
      translation: "Gospodaru moj, podari mi mudrost i pridruži me dobrima. Podari mi lijep spomen među kasnijim naraštajima. Učini me jednim od nasljednika Dženneta blagostanja. Nemoj me osramotiti na Dan kada će ljudi biti proživljeni, na Dan kada neće koristiti ni imetak ni djeca, osim onome ko Allahu dođe čista srca.",
      source: "Kur'an, 26:83-89"
    },
    {
      id: "dova-a24",
      title: "#23",
      type: "dua",
      arabic: "رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَىٰ وَالِدَيَّ وَأَنْ أَعْمَلَ صَالِحًا تَرْضَاهُ وَأَصْلِحْ لِي فِي ذُرِّيَّتِي ۖ إِنِّي تُبْتُ إِلَيْكَ وَإِنِّي مِنَ الْمُسْلِمِينَ",
      transliteration:
        "Rabbi evzi'ni en eškure ni'metekelleti en'amte 'alejje ve 'ala " +
        "validejje ve en a'mele salihan terdah, ve aslih li fi zurrijjeti, " +
        "inni tubtu ilejke ve inni minel-muslimin.",
      translation: "Gospodaru moj, nadahni me da budem zahvalan na blagodati Tvojoj koju si podario meni i roditeljima mojim i da činim dobra djela kojima si zadovoljan. Učini dobrim moje potomstvo. Ja Ti se zaista kajem i ja sam među muslimanima.",
      source: "Kur'an, 46:15"
    },
    {
      id: "dova-a25",
      title: "#24",
      type: "dua",
      arabic: "رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ وَلَا تَجْعَلْ فِي قُلُوبِنَا غِلًّا لِلَّذِينَ آمَنُوا رَبَّنَا إِنَّكَ رَءُوفٌ رَحِيمٌ",
      transliteration:
        "Rabbenagfir lena ve li ihvaninelezine sebekuna bil-imani ve la " +
        "tedž'al fi kulubina gillen lillezine amenu, Rabbena inneke Reufun " +
        "Rahim.",
      translation: "Gospodaru naš, oprosti nama i našoj braći koja su nas u vjeri pretekla i ne dopusti da u srcima našim bude zlobe prema vjernicima. Gospodaru naš, Ti si zaista blag i milostiv.",
      source: "Kur'an, 59:10"
    },
    {
      id: "dova-a26",
      title: "#25",
      type: "dua",
      arabic: [
        "رَبَّنَا عَلَيْكَ تَوَكَّلْنَا وَإِلَيْكَ أَنَبْنَا وَإِلَيْكَ الْمَصِيرُ",
        "رَبَّنَا لَا تَجْعَلْنَا فِتْنَةً لِلَّذِينَ كَفَرُوا وَاغْفِرْ لَنَا رَبَّنَا ۖ إِنَّكَ أَنْتَ الْعَزِيزُ الْحَكِيمُ"
      ],
      transliteration:
        "Rabbena 'alejke tevekkelna ve ilejke enebna ve ilejkel-masir. " +
        "Rabbena la tedž'alna fitneten lillezine keferu vagfir lena " +
        "Rabbena, inneke Entel-'Azizul-Hakim.",
      translation: "Gospodaru naš, na Tebe se oslanjamo, Tebi se obraćamo i Tebi je povratak. Gospodaru naš, nemoj nas učiniti iskušenjem onima koji ne vjeruju i oprosti nam, Gospodaru naš. Zaista, Ti si Silni i Mudri.",
      source: "Kur'an, 60:4-5"
    },
  
    /* Sure -> samo naslov, bez arapskog teksta. */
    {
      id: "dova-a29",
      title: "#28",
      type: "dua",
      arabic: "سُبْحَانَ رَبِّكَ رَبِّ الْعِزَّةِ عَمَّا يَصِفُونَ ۝\n" +
              "وَسَلَامٌ عَلَى الْمُرْسَلِينَ ۝\n" +
              "وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ۝",
      transliteration:
        "Subhane Rabbike Rabbil-'izzeti 'amma jesifun. Ve selamun " +
        "'alel-murselin. Vel-hamdu lillahi Rabbil-'alemin.",
      translation: "Slavljen neka je tvoj Gospodar, Gospodar moći, i čist je od onoga što oni o Njemu govore. Mir poslanicima i hvala Allahu, Gospodaru svjetova.",
      source: "Kur'an, 37:180-182"
    },
    {
      id: "dova-md2",
      title: "#29",
      type: "dua",
      arabic: "رَبِّ اشْرَحْ لِي صَدْرِي ۝\n" +
              "وَيَسِّرْ لِي أَمْرِي ۝\n" +
              "وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي ۝\n" +
              "يَفْقَهُوا قَوْلِي ۝",
      transliteration:
        "Rabbišrah li sadri. Ve jessir li emri. Vahlul 'ukdeten min lisani. " +
        "Jefkahu kavli.",
      translation: "Gospodaru moj, učini prostranim moja prsa, olakšaj mi moj zadatak, razveži uzao s mog jezika da bi razumjeli moj govor.",
      source: "Kur'an, 20:25-28"
    },
    {
      id: "dova-md4",
      title: "#31",
      type: "dua",
      arabic: "اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا",
      transliteration:
        "Allahumme la sehle illa ma dže'altehu sehla, ve Ente " +
        "tedž'alul-hazne iza ši'te sehla.",
      translation: "Allahu, nema ništa lahko osim onoga što Ti učiniš lahkim, a Ti možeš i teškoću, ako hoćeš, učiniti lahkom.",
      source: "Hadis — Sahih Ibn Hibban, 974"
    },
    {
      id: "dova-md5",
      title: "#32",
      type: "dua",
      arabic: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ، وَهُوَ السَّمِيعُ الْعَلِيمُ",
      transliteration:
        "Bismillahillezi la jedurru me'asmihi šej'un fil-erdi ve la fissema'i, " +
        "ve Huves-Semi'ul-'Alim.",
      translation: "U ime Allaha, s čijim imenom ništa na Zemlji ni na nebu ne može nauditi, a On sve čuje i sve zna.",
      source: "Hadis — Sunan Abi Dawud, 5088"
    },
    {
      id: "dova-md8",
      title: "#35",
      type: "dua",
      arabic: "رَبِّ إِنِّي لِمَا أَنْزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ",
      transliteration:
        "Rabbi inni lima enzelte ilejje min hajrin fekir.",
      translation: "Gospodaru moj, meni je zaista potrebna svaka blagodat koju mi Ti pošalješ.",
      source: "Kur'an, 28:24"
    },
    {
      id: "dova-md9",
      title: "#36",
      type: "dua",
      arabic: "رَبِّ أَنْزِلْنِي مُنْزَلًا مُبَارَكًا وَأَنْتَ خَيْرُ الْمُنْزِلِينَ",
      transliteration:
        "Rabbi enzilni munzelen mubareken ve Ente hajrul-munzilin.",
      translation: "Gospodaru moj, spusti me na blagoslovljeno mjesto, a Ti si najbolji od onih koji daju utočište.",
      source: "Kur'an, 23:29"
    }
  ];
  
  /* --------------------------------------------------------------------------
     NAVEČER
     Sura El-Mulk ostaje samo naslov + checkbox (tekst nije dostavljen).
     -------------------------------------------------------------------------- */
  const navecer = [
    {
      id: "navecer-mulk",
      title: "Sura El-Mulk",
      type: "surah",
      source: "Kur'an, El-Mulk"
    },
    {
      id: "navecer-hemm-hazen",
      title: "Allahumme inni e'uzu bike...",
      type: "dua",
      arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَغَلَبَةِ الدَّيْنِ وَقَهْرِ الرِّجَالِ",
      transliteration:
        "Allahumme inni e'uzu bike minel-hemmi vel-hazen, vel-'ajzi vel-kesel, " +
        "vel-buhl vel-džubn, ve galebetid-dejn ve kahrir-ridžal.",
      translation: "Gospodaru moj, utječem Ti se od brige i tuge, od nemoći i lijenosti, od kukavičluka i škrtosti, od tereta duga i od toga da me ljudi savladaju.",
      source: "Hadis — Sahih al-Bukhari, 6369"
    },
    {
      id: "navecer-sejjidul-istigfar",
      title: "Allahumme Ente Rabbi...",
      type: "dua",
      arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي، فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
      transliteration:
        "Allahumme Ente Rabbi, la ilahe illa Ente, halakteni ve ene 'abduke, " +
        "ve ene 'ala 'ahdike ve va'dike mesteta'tu. E'uzu bike min šerri ma sana'tu, " +
        "ebu'u leke bi ni'metike 'alejje, ve ebu'u bi zenbi, fagfir li, " +
        "fe innehu la jagfiruz-zunube illa Ente.",
      translation: "Allahu, Ti si moj Gospodar, nema boga osim Tebe. Ti si me stvorio i ja sam Tvoj rob. Ja sam na zavjetu i obećanju Tvome koliko mogu. Utječem Ti se od zla onoga što sam učinio. Priznajem Tvoju blagodat prema meni i priznajem svoj grijeh, pa mi oprosti, jer grijehe niko osim Tebe ne oprašta.",
      source: "Hadis — Sahih al-Bukhari, 6306"
    },
    {
      id: "navecer-bismillahillezi",
      title: "Bismillahillezi...",
      type: "dua",
      arabic: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ، وَهُوَ السَّمِيعُ الْعَلِيمُ",
      transliteration:
        "Bismillahillezi la jedurru me'asmihi šej'un fil-erdi ve la fissema'i, " +
        "ve Huves-Semi'ul-'Alim.",
      translation: "U ime Allaha, s čijim imenom ništa na Zemlji ni na nebu ne može nauditi, a On sve čuje i sve zna.",
      source: "Hadis — Sunan Abi Dawud, 5088"
    },
    {
      id: "dova-a5",
      title: "#4",
      type: "dua",
      arabic: [
        "سَمِعْنَا وَأَطَعْنَا ۖ غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ الْمَصِيرُ",
        "رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِينَا أَوْ أَخْطَأْنَا ۚ رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِنْ قَبْلِنَا ۚ رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ ۖ وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا ۚ أَنْتَ مَوْلَانَا فَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ"
      ],
      transliteration:
        "Semi'na ve eta'na, gufraneke Rabbena ve ilejkel-masir. Rabbena la " +
        "tuahizna in nesina ev ahta'na, Rabbena ve la tahmil 'alejna isren " +
        "kema hameltehu 'alellezine min kablina, Rabbena ve la tuhammilna " +
        "ma la takate lena bih, va'fu 'anna vagfir lena verhamna, Ente " +
        "Mevlana fensurna 'alel-kavmil-kafirin.",
      translation: "Čuli smo i pokorili smo se. Oprosti nam, Gospodaru naš, i Tebi je povratak. Gospodaru naš, nemoj nas kazniti ako zaboravimo ili pogriješimo. Gospodaru naš, ne natovari na nas teret kao što si ga natovario na one prije nas. Gospodaru naš, ne optereti nas onim što ne možemo podnijeti. Oprosti nam, grijehe nam pokrij i smiluj nam se. Ti si naš Gospodar, pa nam pomozi protiv naroda nevjerničkog.",
      source: "Kur'an, 2:285-286"
    },
  
    /* Sure -> samo naslov, bez arapskog teksta. */
    { id: "navecer-ihlas", title: "El-Ilhas", type: "surah", source: "Kur'an, El-Ihlas" },
    { id: "navecer-felek", title: "El-Felek", type: "surah", source: "Kur'an, El-Felek" },
    { id: "navecer-nas",   title: "En-Nas", type: "surah", source: "Kur'an, En-Nas" },
    { id: "navecer-ajetul-kursijj", title: "Ajetul-Kursijj", type: "surah", source: "Kur'an, 2:255" },
    {
      /* id ostaje isti radi stabilnosti čekiranja, broj je promijenjen na 30 */
      id: "navecer-salavat-20",
      title: "Salavat",
      type: "count",
      repetitions: 30
    },
    /* Samo checkbox i naslov — bez teksta i bez broja ponavljanja.
       "count" bez `repetitions` ne iscrtava oznaku "Nx". */
    { id: "navecer-sehadet", title: "Šehadet", type: "count" }
  ];
  
  /* --------------------------------------------------------------------------
     PETAK
     Postoji SAMO petkom — vidi `days` u nizu `sections` ispod. Ni jedna
     stavka nema teksta: "count" bez `repetitions` iscrtava samo checkbox i
     naslov (isto kao navecer-sehadet).
     -------------------------------------------------------------------------- */
  const petak = [
    { id: "petak-salavati-30", title: "Salavati",     type: "count", repetitions: 30 },
    { id: "petak-kehf",        title: "Sura El-Kehf", type: "surah", source: "Kur'an, El-Kehf" },
    { id: "petak-sadaka",      title: "Sadaka",       type: "count" },
    { id: "petak-duha",        title: "Duha namaz",   type: "count" },
    /* id ostaje "petak-kupanje" iako naslov više nije "Kupanje" — po id-u se
       pamti kvačica, pa mijenjanje id-a briše sve dosad označeno. */
    { id: "petak-kupanje",     title: "Higijena",     type: "count" },
    { id: "petak-dova",        title: "Dova",         type: "count" }
  ];

  /* --------------------------------------------------------------------------
     SEKCIJE — redoslijed na ekranu.
     Premjesti stavku u ovom nizu i aplikacija se sama presloži.
     -------------------------------------------------------------------------- */
  /* Ikonice — inline SVG, bez ijedne vanjske zavisnosti. Ključ je `icon` iz
     niza `sections` ispod, a boju nasljeđuju od teksta oko sebe.

     Stoje ovdje a ne u script.js jer ih crtaju dva mjesta: naslov sekcije na
     listi i zaglavlje akordeona u postavkama — ista sekcija mora nositi isti
     znak na oba, pa se registar ne smije voditi na dva mjesta. */
  const SECTION_ICONS = {
    /* otvorena knjiga */
    book: "M12 7c-1.6-1.3-3.7-2-6-2H3v13h3c2.3 0 4.4.7 6 2m0-13c1.6-1.3 3.7-2 6-2h3v13h-3c-2.3 0-4.4.7-6 2m0-13v13",
    /* petlja ponavljanja — brojani zikr */
    loop: "M17 3l3 3-3 3M20 6H9a4 4 0 0 0 0 8M7 21l-3-3 3-3M4 18h11a4 4 0 0 0 0-8",
    /* sklopljene ruke sa svjetlom iznad */
    hands: "M4 13a8 8 0 0 0 16 0zM12 3v3.5M7.5 5l1.4 2.2M16.5 5l-1.4 2.2",
    /* mlađak */
    moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
    /* kupola sa špicem — sekcija vezana za poseban dan (petak) */
    mosque: "M4 20h16M6 20v-6a6 6 0 0 1 12 0v6M12 4v4",
    /* list papira — dugme "Vidi stranicu" */
    pages: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
    /* kvačica — zeleni znak "gotovo" uz završenu sekciju i završenu traku */
    check: "M4.5 12.5l5 5 10-11"
  };

  /* Vraća <svg> za dati ključ, ili null ako ga u registru nema. Klasa se daje
     izvana jer isti znak nosi različitu veličinu na listi i u postavkama. */
  function makeSectionIcon(name, className) {
    var d = SECTION_ICONS[name];
    if (!d) { return null; }
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", className || "section-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  /* `icon` bira znak iz registra `SECTION_ICONS` iznad:
     "book" | "loop" | "hands" | "moon" | "mosque"

     `days` (opciono) — dani sedmice u kojima sekcija POSTOJI, po JS
     konvenciji: 0 = nedjelja … 5 = petak, 6 = subota. Sekcija bez `days`
     postoji svaki dan, pa se postojeće četiri ne diraju. Filtriranje radi
     `sectionsForDate()` ispod — i aplikacija i server idu kroz njega. */
  const sections = [
    { id: "petak",   title: "Petak",   icon: "mosque", kind: "list", items: petak, days: [5] },
    { id: "quran",   title: "Kur'an",  icon: "book",   kind: "quran" },
    { id: "zikr",    title: "Zikr",    icon: "loop",   kind: "list", items: zikr },
    { id: "dove",    title: "Dove",    icon: "hands",  kind: "list", items: dove },
    { id: "navecer", title: "Navečer", icon: "moon",   kind: "list", items: navecer }
  ];

  /* Dan sedmice iz ključa "YYYY-MM-DD": 0 = nedjelja … 5 = petak.

     Ide preko Date.UTC, a NIKAD preko new Date("2026-08-21").getDay(): taj
     oblik se parsira kao UTC ponoć pa prevede u lokalnu zonu, i zapadno od
     Londona vrati dan ranije. Vraća -1 za neispravan ključ. */
  function weekdayFromKey(dateKey) {
    var parts = String(dateKey || "").split("-");
    if (parts.length !== 3) { return -1; }
    var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return isNaN(d.getTime()) ? -1 : d.getUTCDay();
  }

  /* --------------------------------------------------------------------------
     CONFIG KORISNIKA

     Config je jedini način da se spisak promijeni bez deploya, pa je i jedino
     mjesto na kojem sadržaj nije u ovom fajlu. Četiri polja:

       transkript   ekran pokazuje transliteraciju umjesto arapskog
       skriveno     spisak id-eva stavki koje korisnik ne želi vidjeti
       izmjene      { idStavke: { polje: vrijednost } } — korisnikove izmjene
                    stavki IZ OVOG FAJLA. Pamti se samo ono što je stvarno
                    promijenio; sve ostalo i dalje dolazi odavde, pa ispravka
                    prevoda u data.js stigne i do onoga ko je toj dovi
                    promijenio samo broj ponavljanja.
       stranice     koliko se stranica mushafa uči u jednom danu (1 = zatečeno)
       dodatno      vlastite stavke korisnika, po sekciji

     Čišćenje configa stoji OVDJE, a ne u settings.js i u api/_lib.js — kroz
     istu funkciju prolazi i ono što browser upiše u localStorage i ono što
     server primi u tijelu zahtjeva, pa se dva pravila ne mogu razići. Prije
     je bilo prepisano na oba mjesta.

     Sve što nije prepoznato otpada. To nije sitnica nego zaštita: config sa
     servera crta ekran i ulazi u račun podsjetnika, pa nepoznato polje ne
     smije proći dalje.
     -------------------------------------------------------------------------- */

  /* Vlastita stavka nosi id koji se ne može sudariti sa id-em iz ovog fajla.
     Isti izraz koristi i server (api/_lib.js) da takav id pusti u bazu —
     inače bi svaka kvačica na vlastitoj dovi bila odbačena kao nepoznata. */
  var CUSTOM_ITEM_ID = /^custom-[a-z0-9]{4,32}$/;

  /* Granice postoje da tijelo zahtjeva ne može biti proizvoljno veliko.
     Šezdeset vlastitih stavki je daleko iznad svake stvarne upotrebe. */
  var MAX_CUSTOM = 60;
  var MAX_REPS = 999;

  /* Koliko id-eva stane u jedan zapis redoslijeda. Najduža sekcija ima
     34 stavke, a vlastitih ih može biti još šezdeset — 300 je daleko iznad
     svake stvarne upotrebe, a tijelo zahtjeva drži malim. */
  var MAX_REDOSLIJED = 300;

  /* Gornja granica dnevne porcije mushafa — jedan džuz. Nije zabrana nego
     mjera: cijela porcija stoji na JEDNOJ kartici sa jednom kvačicom, pa
     preko toga kartica prestaje biti kartica. */
  var MAX_STRANICA = 20;

  /* Broj ponavljanja iz configa. Vraća 0 za sve što nije broj — pozivalac to
     čita kao "nema zapisa", pa vrijedi ono što piše u ovom fajlu. */
  function cleanBroj(raw) {
    var n = (typeof raw === "number") ? raw : parseInt(raw, 10);
    if (!isFinite(n)) { return 0; }
    n = Math.floor(n);
    if (n < 1) { return 0; }
    return Math.min(n, MAX_REPS);
  }

  function cleanText(raw, max) {
    if (typeof raw !== "string") { return ""; }
    return raw.trim().slice(0, max);
  }

  /* Sekcije u koje vlastita stavka SMIJE ući. Kur'anska ne može: ona nije
     lista nego jedna stavka (vidi `sectionItems()`), pa nema gdje dopisati.

     Isti spisak vrijedi i za redoslijed (`cleanRedoslijed()`) — u sekciji sa
     jednom stavkom nema šta prerasporediti. */
  function customSectionIds() {
    var out = Object.create(null);
    sections.forEach(function (section) {
      if (section.kind !== "quran") { out[section.id] = true; }
    });
    return out;
  }

  /* Vlastite stavke — samo one koje su cijele i smislene.

     Stavka bez naslova (ili dova bez ijednog teksta) se ne pamti: na ekranu
     bi bila prazna kartica koju korisnik ne bi znao ni prepoznati ni
     obrisati. Bolje da upis ne prođe nego da ostane duh u spisku. */
  function cleanCustom(raw) {
    if (!Array.isArray(raw)) { return []; }

    var dozvoljene = customSectionIds();
    var vidjeno = Object.create(null);
    var out = [];

    raw.slice(0, MAX_CUSTOM * 4).forEach(function (item) {
      if (out.length >= MAX_CUSTOM) { return; }
      if (!item || typeof item !== "object") { return; }

      var id = (typeof item.id === "string") ? item.id : "";
      if (!CUSTOM_ITEM_ID.test(id) || vidjeno[id]) { return; }
      if (!dozvoljene[item.sekcija]) { return; }

      var entry = { id: id, sekcija: item.sekcija, type: "count" };

      if (item.type === "dua") {
        entry.type = "dua";
        entry.arabic = cleanText(item.arabic, 2000);
        entry.transliteration = cleanText(item.transliteration, 2000);
        entry.translation = cleanText(item.translation, 2000);
        entry.source = cleanText(item.source, 120);
        /* Naslova nema namjerno — dove se numerišu same (`itemTitles()`), pa
           bi vlastita dova sa imenom ispala iz reda ostalih. */
        if (!entry.arabic && !entry.transliteration && !entry.translation) { return; }
      } else {
        entry.title = cleanText(item.title, 80);
        if (!entry.title) { return; }
        var n = cleanBroj(item.repetitions);
        /* 1 ponavljanje nije brojač nego obična kvačica — ne pamti se. */
        if (n > 1) { entry.repetitions = n; }
      }

      vidjeno[id] = true;
      out.push(entry);
    });

    return out;
  }

  /* Svi id-evi koje config smije spominjati: stavke iz ovog fajla (uz
     "quran", koji nije u `items`) plus vlastite stavke TOG korisnika. Po
     ovome otpada zastario zapis — dova obrisana iz data.js, ili vlastita
     stavka koja je u međuvremenu obrisana. */
  function knownItemIds(custom) {
    var out = Object.create(null);
    sections.forEach(function (section) {
      if (section.kind === "quran") { out.quran = true; return; }
      (section.items || []).forEach(function (item) { out[item.id] = true; });
    });
    (custom || []).forEach(function (item) { out[item.id] = true; });
    return out;
  }

  /* Polja stavke koja korisnik smije promijeniti, i granica dužine svakog.
     Ono čega ovdje nema (id, type, sekcija) se ne mijenja: izmjena tipa bi od
     Fatihe napravila brojani zikr, a izmjena id-a bi pobrisala sve dosad
     čekirano. */
  var IZMJENJIVA = {
    title: 80,
    arabic: 2000,
    transliteration: 2000,
    translation: 2000,
    source: 120
  };

  /* Izmjene jedne stavke iz ovog fajla. Pamti se SAMO ono što je poslano —
     stavka bez upisanog prevoda i dalje uzima prevod odavde, pa ispravka u
     data.js stigne i do onoga ko je toj dovi promijenio samo broj.

     Prazan string je valjana vrijednost i znači "obriši mi ovaj dio" (npr.
     izvor). Zato se razlikuje od polja kojeg u zapisu uopšte nema. */
  function cleanIzmjena(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { return null; }

    var out = {};
    var ima = false;

    Object.keys(IZMJENJIVA).sort().forEach(function (key) {
      if (typeof raw[key] !== "string") { return; }
      out[key] = cleanText(raw[key], IZMJENJIVA[key]);
      ima = true;
    });

    var n = cleanBroj(raw.repetitions);
    if (n) { out.repetitions = n; ima = true; }

    return ima ? out : null;
  }

  /* Ključevi se sortiraju iz istog razloga iz kojeg i `skriveno`: aplikacija
     poredi svoj config sa onim sa servera preko JSON.stringify, pa bi isti
     zapis u drugom redoslijedu prošao kao promjena i ponovo iscrtao ekran.

     Samo stavke IZ OVOG FAJLA: vlastita stavka svoj sadržaj nosi u `dodatno`,
     pa bi zapis na dva mjesta značio dva izvora istine za istu karticu. */
  function cleanIzmjene(raw, known) {
    var out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { return out; }

    Object.keys(raw).slice(0, 500).sort().forEach(function (id) {
      if (!known[id]) { return; }
      var izmjena = cleanIzmjena(raw[id]);
      if (izmjena) { out[id] = izmjena; }
    });

    return out;
  }

  /* Koliko se stranica uči dnevno. Sve što nije upotrebljiv broj pada na 1 —
     zatečeno ponašanje, jedna stranica dnevno. */
  function cleanStranice(raw) {
    var n = (typeof raw === "number") ? raw : parseInt(raw, 10);
    if (!isFinite(n)) { return 1; }
    n = Math.floor(n);
    if (n < 1) { return 1; }
    return Math.min(n, MAX_STRANICA);
  }

  /* Korisnikov redoslijed stavki, po sekciji: `{ "<sekcija>": ["id", ...] }`.

     Spisak NE mora biti potpun i ne mora se održavati: sve čega u njemu nema
     — nova dova iz ovog fajla, tek dodana vlastita stavka — ostaje na svom
     mjestu iza onoga što jeste (vidi `poredaj()`). Zato nova stavka ne traži
     upis ni u čiji config, isto kao što ga ne traži ni `skriveno`.

     Ključevi su iste sekcije u koje smije i vlastita stavka: kur'anska nije
     lista nego jedna stavka, pa u njoj nema šta prerasporediti.

     Ključevi se sortiraju iz istog razloga kao kod `izmjene`: config se sa
     serverom poredi preko JSON.stringify, pa bi isti zapis u drugom
     redoslijedu ključeva prošao kao promjena i ponovo iscrtao ekran. */
  function cleanRedoslijed(raw, known) {
    var out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { return out; }

    var dozvoljene = customSectionIds();

    Object.keys(raw).slice(0, 50).sort().forEach(function (sekcija) {
      if (!dozvoljene[sekcija]) { return; }
      if (!Array.isArray(raw[sekcija])) { return; }

      var vidjeno = Object.create(null);
      var ids = raw[sekcija].slice(0, MAX_REDOSLIJED).filter(function (id) {
        if (typeof id !== "string" || !known[id] || vidjeno[id]) { return false; }
        vidjeno[id] = true;
        return true;
      });

      /* Prazan spisak nije redoslijed — ne pamti se, pa sekcija ostaje na
         zatečenom poretku umjesto da nosi zapis koji ništa ne kaže. */
      if (ids.length) { out[sekcija] = ids; }
    });

    return out;
  }

  /* Stavke poređane po korisnikovom spisku. Ono čega u spisku nema ide IZA,
     u zatečenom redoslijedu — tako nova dova iz ovog fajla ne nestane i ne
     upadne nasumično u sredinu tuđeg poretka, nego se pojavi na dnu sekcije
     gdje se i vidi da je nova. */
  function poredaj(items, order) {
    var mjesto = Object.create(null);
    order.forEach(function (id, i) { mjesto[id] = i; });

    var poznate = [];
    var ostale = [];

    items.forEach(function (item) {
      if (mjesto[item.id] === undefined) { ostale.push(item); }
      else { poznate.push(item); }
    });

    poznate.sort(function (a, b) { return mjesto[a.id] - mjesto[b.id]; });
    return poznate.concat(ostale);
  }

  function defaultPrefs() {
    return {
      transkript: false, skriveno: [], izmjene: {}, stranice: 1, dodatno: [],
      redoslijed: {}
    };
  }

  /* Config kakav se smije zapamtiti i poslati. Redoslijed poslova nije
     proizvoljan: `dodatno` ide prvo jer tek iz njega izlazi spisak poznatih
     id-eva, po kojem se onda čisti `skriveno`. Obrnutim redom bi kvačica na
     vlastitoj dovi otpala kao "nepoznat id". */
  function cleanPrefs(raw) {
    var out = defaultPrefs();
    if (!raw || typeof raw !== "object") { return out; }

    if (typeof raw.transkript === "boolean") { out.transkript = raw.transkript; }

    out.dodatno = cleanCustom(raw.dodatno);
    var known = knownItemIds(out.dodatno);

    if (Array.isArray(raw.skriveno)) {
      var vidjeno = Object.create(null);
      out.skriveno = raw.skriveno.slice(0, 1000).filter(function (id) {
        if (typeof id !== "string" || !known[id] || vidjeno[id]) { return false; }
        vidjeno[id] = true;
        return true;
      }).sort();
    }

    /* `izmjene` idu SAMO nad stavkama iz ovog fajla, pa im spisak nije
       `known` (koji nosi i vlastite) nego goli spisak odavde. */
    out.izmjene = cleanIzmjene(raw.izmjene, knownItemIds([]));
    out.stranice = cleanStranice(raw.stranice);
    /* Redoslijed smije spominjati i vlastite stavke, pa ide nad `known` —
       isto sito kroz koje je prošlo i `skriveno`. */
    out.redoslijed = cleanRedoslijed(raw.redoslijed, known);

    return out;
  }

  /* --------------------------------------------------------------------------
     Config -> sekcije

     Vlastite stavke i korisnikove izmjene se NE gledaju nigdje osim ovdje.
     Sve dalje (ekran, postavke, podsjetnici) radi sa običnim sekcijama i ne
     zna da li stavka dolazi iz ovog fajla ili iz korisnikovog configa.
     -------------------------------------------------------------------------- */

  /* Vlastite stavke jedne sekcije, u obliku obične stavke iz ovog fajla.
     Nose `custom: true` — po tome postavke znaju kojoj se stavci nudi
     olovka za izmjenu, a ekran to polje uopšte ne gleda. */
  function customFor(prefs, sectionId) {
    var list = (prefs && Array.isArray(prefs.dodatno)) ? prefs.dodatno : [];

    return list.filter(function (c) {
      return c && c.sekcija === sectionId && typeof c.id === "string";
    }).map(function (c) {
      var item = { id: c.id, custom: true };

      if (c.type === "dua") {
        item.type = "dua";
        item.title = "";
        item.arabic = c.arabic || "";
        item.transliteration = c.transliteration || "";
        item.translation = c.translation || "";
        if (c.source) { item.source = c.source; }
      } else {
        item.type = "count";
        item.title = c.title || "";
        if (c.repetitions) { item.repetitions = c.repetitions; }
      }

      return item;
    });
  }

  /* Sekcija sa dopisanim vlastitim stavkama i primijenjenim izmjenama.

     KOPIJA, nikad izmjena zatečenog objekta: `sections` je jedan zajednički
     niz, a na serveru kroz istu (toplu) instancu prolaze configi više
     korisnika — izmjena na mjestu bi Harisov spisak nakalemila Leili. Kad
     korisnik nije ništa promijenio, vraća se zatečena sekcija i kopije nema. */
  function withConfig(section, prefs) {
    if (section.kind === "quran") { return section; }

    var extra = customFor(prefs, section.id);
    var izmjene = (prefs && prefs.izmjene && typeof prefs.izmjene === "object")
      ? prefs.izmjene : {};
    var promjena = extra.length > 0;

    var items = (section.items || []).concat(extra).map(function (item) {
      var izmjena = izmjene[item.id];
      if (!izmjena) { return item; }
      promjena = true;
      var copy = {};
      Object.keys(item).forEach(function (k) { copy[k] = item[k]; });
      Object.keys(izmjena).forEach(function (k) { copy[k] = izmjena[k]; });
      return copy;
    });

    /* Korisnikov redoslijed ide POSLIJE dopisivanja vlastitih stavki i
       izmjena — u spisku moraju biti sve stavke koje sekcija ima, inače bi
       vlastita dova uvijek završavala na dnu.

       Sve dalje zavisi samo od poretka u `items`, pa se reda na jednom
       mjestu: ekran, postavke i numeracija dova (`itemTitles()`) idu kroz
       `fullSections()`, a podsjetnici kroz `sectionsForDate()` — i jedno i
       drugo prolazi ovuda. Numeracija zato prati redoslijed: dova povučena na
       vrh postane "DOVA #1" i u postavkama i na ekranu. */
    var order = (prefs && prefs.redoslijed && typeof prefs.redoslijed === "object")
      ? prefs.redoslijed[section.id] : null;

    if (Array.isArray(order) && order.length) {
      var poredane = poredaj(items, order);
      var isto = poredane.every(function (item, i) { return items[i] === item; });
      if (!isto) { items = poredane; promjena = true; }
    }

    if (!promjena) { return section; }

    var out = {};
    Object.keys(section).forEach(function (k) { out[k] = section[k]; });
    out.items = items;
    return out;
  }

  /* SVE sekcije onako kako ih taj korisnik ima — sa svojim stavkama i svojim
     izmjenama, ali BEZ sakrivanja i bez filtriranja po danu. Iz ovoga se
     grade postavke i numeracija dova; ekran i podsjetnici idu kroz
     `sectionsForDate()` ispod, koji ovo dodatno prosije. */
  function fullSections(prefs) {
    return sections.map(function (section) { return withConfig(section, prefs); });
  }

  /* Stavka tačno onako kako je u ovom fajlu, bez ijedne korisnikove izmjene.
     Postavkama treba da bi u polju za broj mogle pokazati šta vrijedi kad se
     polje isprazni. Vraća null za vlastitu stavku — nje u fajlu i nema. */
  function baseItem(id) {
    var found = null;
    sections.forEach(function (section) {
      (section.items || []).forEach(function (item) {
        if (item.id === id) { found = item; }
      });
    });
    return found;
  }

  /* JEDINI izvor istine za "koje sekcije postoje tog dana" — koriste ga i
     aplikacija (script.js) i server (api/_lib.js), pa se pravilo ne vodi na
     dva mjesta koja se mogu razići.

     Prima ISTI ključ datuma pod kojim se pamti čekirano (dateKey u
     aplikaciji, now.date na serveru), pa se sekcija, spisak čekiranog i
     podsjetnik prebacuju u novi dan u istom trenutku.

     `prefs` je config korisnika. Iz njega dolaze i vlastite stavke i vlastiti
     izmjene (`fullSections()` iznad), a ovdje se dodatno odbacuje ono što je
     na spisku `skriveno`. Nepoznat ili nepostojeći config ne gasi ništa:
     ugašeno mora biti izričito na tom spisku, inače bi svaki poziv bez
     configa (stari kod, uređaj bez imena) tiho pobrisao pola spiska.

     Server prosljeđuje config vlasnika baze, pa isključena stavka znači isto
     na ekranu i u odluci o podsjetniku: nema je u računu, a sekcija kojoj je
     isključeno sve dobije total 0 i njen podsjetnik ućuti. */
  function sectionsForDate(dateKey, prefs) {
    var wd = weekdayFromKey(dateKey);
    var skriveno = (prefs && Array.isArray(prefs.skriveno)) ? prefs.skriveno : [];

    return fullSections(prefs).filter(function (section) {
      if (section.days && section.days.indexOf(wd) === -1) { return false; }
      /* Kur'anska sekcija nema `items` pa je ne može isprazniti filter ispod —
         gasi je njena jedina stavka, pod id-em "quran". */
      if (section.kind === "quran") { return skriveno.indexOf("quran") === -1; }
      return true;
    }).map(function (section) {
      if (!section.items || !skriveno.length) { return section; }

      var kept = section.items.filter(function (item) {
        return skriveno.indexOf(item.id) === -1;
      });
      if (kept.length === section.items.length) { return section; }

      /* KOPIJA, ne izmjena zatečenog objekta — vidi `withConfig()`. */
      var copy = {};
      Object.keys(section).forEach(function (k) { copy[k] = section[k]; });
      copy.items = kept;
      return copy;
    /* Sekcija kojoj je isključeno sve nema šta prikazati na glavnoj
       listi, ali u postavkama jeste — njenu stavku je moguće opet uključiti.
       Dakle, ostaje u resultu ali sa praznom stavkom (`items: []`). Njen
       podsjetnik dobije total 0 i sam ućuti. Kur'anska sekcija nema `items`
       (jedna je stavka) i nikad ne biva ispražnjena.
       Na ekranu će se tada umjesto liste stavki prikazati "nema dova" + dugme. */
    });
  }
  
  /* Stavke sekcije onako kako ih vidi korisnik u postavkama.

     Kur'anska sekcija nije lista: ona je JEDNA stavka i pamti se pod poljem
     "quran". Da bi i ona mogla u spisak kvačica, ovdje dobija svoj jedan red.
     `items` joj se namjerno NE dodaje u nizu `sections` gore — ušla bi u svaki
     račun koji ide preko `section.items` (a svi oni Kur'an već broje posebno,
     preko `kind === "quran"`), pa bi se stranica računala dvaput. */
  /* Tip "quran" postoji samo ovdje i samo za postavke: nije ni dova ni
     brojani zikr, pa se ne smije predstaviti kao "count" — forma bi joj tada
     ponudila broj ponavljanja umjesto broja stranica. Ekran ovu stavku ne
     crta kroz `renderItem()` nego kroz `renderQuranCard()`. */
  var QURAN_ITEM = { id: "quran", title: "Današnja stranica", type: "quran" };

  function sectionItems(section) {
    if (!section) { return []; }
    if (section.kind === "quran") { return [QURAN_ITEM]; }
    return section.items || [];
  }

  /* Sekcije čije se POJEDINAČNE stavke smiju isključiti — sve. Iz ovoga se
     gradi spisak kvačica u postavkama.

     Prima config jer u spisku moraju stajati i vlastite stavke: one se u
     postavkama i prave, i sakrivaju, i brišu. Bez configa vraća goli spisak
     iz ovog fajla. */
  function pickableSections(prefs) {
    return fullSections(prefs);
  }

  /* Naslovi kakve korisnik vidi: { idStavke: "DOVA #7" }.

     Numeracija dova ide preko CIJELOG spiska sekcije, a ne preko onoga što je
     trenutno prikazano — zato se ovdje traži sekcija u `sections`, a ne prima
     ona koju vrati `sectionsForDate()`. Bez toga bi sakrivanje jedne dove
     prenumerisalo sve ispod nje, pa se u postavkama i na ekranu ista dova ne
     bi zvala isto. Ovako "DOVA #7" ostane #7, a u spisku se vidi rupa —
     tačan opis stanja, jer je ta dova stvarno isključena.

     Config se prima iz istog razloga: vlastita dova se numeriše zajedno sa
     ostalima ("DOVA #35"), pa mora biti u spisku po kojem se broji. */
  function itemTitles(sectionId, prefs) {
    var out = {};
    var found = null;
    fullSections(prefs).forEach(function (s) { if (s.id === sectionId) { found = s; } });
    if (!found) { return out; }

    var duaNo = 0;
    sectionItems(found).forEach(function (item) {
      if (item.type === "dua") {
        duaNo += 1;
        out[item.id] = "DOVA #" + duaNo;
      } else {
        out[item.id] = item.title;
      }
    });
    return out;
  }

  /* --------------------------------------------------------------------------
     KUR'AN
     Stranica se računa automatski: na QURAN_START_DATE je QURAN_START_PAGE,
     svaki sljedeći dan +1. Podaci o stranicama su u quran-pages.js.
     -------------------------------------------------------------------------- */
  const QURAN_START_PAGE = 86;
  const QURAN_START_DATE = "2026-08-17"; // YYYY-MM-DD (lokalni datum)
  const QURAN_TOTAL_PAGES = 604;

/* --------------------------------------------------------------------------
   Node (Vercel funkcije) — u browseru `module` ne postoji, pa se preskače.

   Server računa "koliko je od podsjetnika urađeno" iz istog ovog spiska,
   da se sadržaj ne bi vodio na dva mjesta koja se mogu razići. Iznad ove
   linije nema ni jedne zavisnosti od browsera niti od quran-pages.js, pa
   se fajl smije `require`-ovati.
   -------------------------------------------------------------------------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    /* SVE sekcije, dan-neovisno — iz ovoga se gradi spisak ispravnih id-eva
       (validacija upisa u api/_lib.js). */
    sections: sections,
    /* Sekcije TOG dana — iz ovoga taskStatus() broji dokle je podsjetnik
       stigao. Dvije stvari, namjerno razdvojene: kvačica napravljena u petak
       u 23:58 a poslana u subotu u 00:03 mora proći validaciju. */
    sectionsForDate: sectionsForDate,
    /* Sekcije čije se stavke smiju isključiti — iz ovoga se gradi spisak
       ispravnih id-eva za polje `skriveno` u configu. */
    pickableSections: pickableSections,
    sectionItems: sectionItems,
    itemTitles: itemTitles,
    weekdayFromKey: weekdayFromKey,
    /* Config: čišćenje stoji ovdje, pa isti zapis prolazi kroz ista pravila
       i u browseru (settings.js) i na serveru (api/_lib.js). */
    defaultPrefs: defaultPrefs,
    cleanPrefs: cleanPrefs,
    /* Stavka bez ijedne korisnikove izmjene — iz nje postavke pune formu. */
    baseItem: baseItem,
    /* Izraz po kojem se prepoznaje id vlastite stavke — server ga pušta u
       bazu iako ga nema u data.js. */
    CUSTOM_ITEM_ID: CUSTOM_ITEM_ID
  };
}
