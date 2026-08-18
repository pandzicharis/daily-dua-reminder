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

   TIPOVI:
     "surah"   -> samo checkbox + naslov, bez teksta (sve sure)
     "count"   -> checkbox + naslov + broj ponavljanja, bez teksta
     "dua"     -> checkbox + naslov + arapski + prevod

   Naslov dove se ne piše ovdje — aplikacija ih sama numeriše po sekciji
   ("DOVA #1", "DOVA #2", ...). `title` je bitan samo za "surah" i "count".

   TRANSLITERACIJA I SITNE OZNAKE SE NE PRIKAZUJU. Polja `transliteration`
   su ostavljena u fajlu da se ne izgubi ono što si poslao, ali ih
   aplikacija ignoriše — ispod arapskog ide samo `translation`.
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
      title: "Allahume Ente Rabbi...",
      type: "dua",
      arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي، فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
      transliteration:
        "Allahume Ente Rabbi, la ilahe illa Ente, halakteni ve ene 'abduke, " +
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
      translation: "Gospodaru naš, primi od nas! Zaista Ti sve čuješ i sve znaš.",
      source: "Kur'an, 2:127"
    },
    {
      id: "dova-a3",
      title: "#2",
      type: "dua",
      arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
      translation: "Gospodaru naš, daj nam dobro na ovom svijetu i dobro na budućem svijetu i sačuvaj nas kazne Džehennema.",
      source: "Kur'an, 2:201"
    },
    {
      id: "dova-a4",
      title: "#3",
      type: "dua",
      arabic: "رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ",
      translation: "Gospodaru naš, obaspi nas strpljivošću, učvrsti naše noge i pomozi nam protiv naroda nevjerničkog.",
      source: "Kur'an, 2:250"
    },
    {
      id: "dova-a6",
      title: "#5",
      type: "dua",
      arabic: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً ۚ إِنَّكَ أَنْتَ الْوَهَّابُ",
      translation: "Gospodaru naš, ne dopusti da naša srca skrenu nakon što si nas uputio i daruj nam od Sebe milost. Zaista, Ti si Onaj Koji mnogo daruje.",
      source: "Kur'an, 3:8"
    },
    {
      id: "dova-a7",
      title: "#6",
      type: "dua",
      arabic: "رَبَّنَا إِنَّنَا آمَنَّا فَاغْفِرْ لَنَا ذُنُوبَنَا وَقِنَا عَذَابَ النَّارِ",
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
      translation: "Reci: 'Allahu, Gospodaru svega što postoji, Ti daješ vlast kome hoćeš, a oduzimaš vlast od koga hoćeš. Ti uzvisuješ koga hoćeš, a ponižavaš koga hoćeš. U Tvojoj ruci je svako dobro i Ti nad svime imaš moć. Ti uvodiš noć u dan i uvodiš dan u noć. Ti izvodiš živo iz mrtvog i izvodiš mrtvo iz živog. Ti opskrbljuješ koga hoćeš bez računa.'",
      source: "Kur'an, 3:26-27"
    },
    {
      id: "dova-a9",
      title: "#8",
      type: "dua",
      arabic: "رَبَّنَا آمَنَّا بِمَا أَنْزَلْتَ وَاتَّبَعْنَا الرَّسُولَ فَاكْتُبْنَا مَعَ الشَّاهِدِينَ",
      translation: "Gospodaru naš, vjerujemo u ono što si objavio i slijedimo Poslanika, pa nas upiši među svjedoke.",
      source: "Kur'an, 3:53"
    },
    {
      id: "dova-a10",
      title: "#9",
      type: "dua",
      arabic: "رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ",
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
      translation: "Gospodaru naš, Ti ovo nisi uzalud stvorio. Slavljen neka si Ti, pa nas sačuvaj kazne u Vatri. Gospodaru naš, koga Ti uvedeš u Vatru, Ti si ga ponizio, a nasilnicima nema pomagača. Gospodaru naš, mi smo čuli glasnika koji poziva vjeri: 'Vjerujte u Gospodara svoga!', pa smo vjerovali. Gospodaru naš, oprosti nam grijehe naše, poništi naša loša djela i usmrti nas s dobrima. Gospodaru naš, podari nam ono što si nam obećao preko Svojih poslanika i nemoj nas poniziti na Sudnjem danu. Zaista, Ti ne kršiš obećanje.",
      source: "Kur'an, 3:191-194"
    },
    {
      id: "dova-a12",
      title: "#11",
      type: "dua",
      arabic: "رَبَّنَا ظَلَمْنَا أَنْفُسَنَا وَإِنْ لَمْ تَغْفِرْ لَنَا وَتَرْحَمْنَا لَنَكُونَنَّ مِنَ الْخَاسِرِينَ",
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
      translation: "Gospodaru moj, učini mene i potomstvo moje ustrajnima u obavljanju namaza. Gospodaru naš, primi moju dovu. Gospodaru naš, oprosti meni, mojim roditeljima i svim vjernicima na Dan kada se bude polagao račun.",
      source: "Kur'an, 14:40-41"
    },
    {
      id: "dova-a16",
      title: "#15",
      type: "dua",
      arabic: "رَبِّ أَدْخِلْنِي مُدْخَلَ صِدْقٍ وَأَخْرِجْنِي مُخْرَجَ صِدْقٍ وَاجْعَلْ لِي مِنْ لَدُنْكَ سُلْطَانًا نَصِيرًا",
      translation: "Gospodaru moj, uvedi me na lijep način i izvedi me na lijep način i podari mi od Sebe snagu koja će mi pomoći.",
      source: "Kur'an, 17:80"
    },
    {
      id: "dova-a17",
      title: "#16",
      type: "dua",
      arabic: "رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا",
      translation: "Gospodaru naš, podari nam od Sebe milost i pripremi nam u našem poslu ono što je ispravno.",
      source: "Kur'an, 18:10"
    },
    {
      id: "dova-a18",
      title: "#17",
      type: "dua",
      arabic: "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
      translation: "Nema boga osim Tebe, slavljen neka si Ti! Ja sam zaista bio među onima koji su sebi nepravdu učinili.",
      source: "Kur'an, 21:87"
    },
    {
      id: "dova-a19",
      title: "#18",
      type: "dua",
      arabic: "رَبِّ لَا تَذَرْنِي فَرْدًا وَأَنْتَ خَيْرُ الْوَارِثِينَ",
      translation: "Gospodaru moj, ne ostavljaj me samog, a Ti si najbolji nasljednik.",
      source: "Kur'an, 21:89"
    },
    {
      id: "dova-a20",
      title: "#19",
      type: "dua",
      arabic: "رَبِّ أَعُوذُ بِكَ مِنْ هَمَزَاتِ الشَّيَاطِينِ ۝\n" +
              "وَأَعُوذُ بِكَ رَبِّ أَنْ يَحْضُرُونِ",
      translation: "Gospodaru moj, utječem Ti se od šejtanskih došaptavanja i utječem Ti se, Gospodaru moj, da mi se približe.",
      source: "Kur'an, 23:97-98"
    },
    {
      id: "dova-a21",
      title: "#20",
      type: "dua",
      arabic: "رَبَّنَا اصْرِفْ عَنَّا عَذَابَ جَهَنَّمَ ۖ إِنَّ عَذَابَهَا كَانَ غَرَامًا ۝\n" +
              "إِنَّهَا سَاءَتْ مُسْتَقَرًّا وَمُقَامًا",
      translation: "Gospodaru naš, odvrati od nas patnju Džehennema, jer je njegova patnja zaista neprekidna. On je ružno boravište i prebivalište.",
      source: "Kur'an, 25:65-66"
    },
    {
      id: "dova-a22",
      title: "#21",
      type: "dua",
      arabic: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا",
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
      translation: "Gospodaru moj, podari mi mudrost i pridruži me dobrima. Podari mi lijep spomen među kasnijim naraštajima. Učini me jednim od nasljednika Dženneta blagostanja. Nemoj me osramotiti na Dan kada će ljudi biti proživljeni, na Dan kada neće koristiti ni imetak ni djeca, osim onome ko Allahu dođe čista srca.",
      source: "Kur'an, 26:83-89"
    },
    {
      id: "dova-a24",
      title: "#23",
      type: "dua",
      arabic: "رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَىٰ وَالِدَيَّ وَأَنْ أَعْمَلَ صَالِحًا تَرْضَاهُ وَأَصْلِحْ لِي فِي ذُرِّيَّتِي ۖ إِنِّي تُبْتُ إِلَيْكَ وَإِنِّي مِنَ الْمُسْلِمِينَ",
      translation: "Gospodaru moj, nadahni me da budem zahvalan na blagodati Tvojoj koju si podario meni i roditeljima mojim i da činim dobra djela kojima si zadovoljan. Učini dobrim moje potomstvo. Ja Ti se zaista kajem i ja sam među muslimanima.",
      source: "Kur'an, 46:15"
    },
    {
      id: "dova-a25",
      title: "#24",
      type: "dua",
      arabic: "رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ وَلَا تَجْعَلْ فِي قُلُوبِنَا غِلًّا لِلَّذِينَ آمَنُوا رَبَّنَا إِنَّكَ رَءُوفٌ رَحِيمٌ",
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
      translation: "Gospodaru moj, učini prostranim moja prsa, olakšaj mi moj zadatak, razveži uzao s mog jezika da bi razumjeli moj govor.",
      source: "Kur'an, 20:25-28"
    },
    {
      id: "dova-md4",
      title: "#31",
      type: "dua",
      arabic: "اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا",
      translation: "Allahu, nema ništa lahko osim onoga što Ti učiniš lahkim, a Ti možeš i teškoću, ako hoćeš, učiniti lahkom.",
      source: "Hadis — Sahih Ibn Hibban, 974"
    },
    {
      id: "dova-md5",
      title: "#32",
      type: "dua",
      arabic: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ، وَهُوَ السَّمِيعُ الْعَلِيمُ",
      transliteration:
        "Bismillahillezi la jedurru me'asmihi šej'un fil-erdi ve la fissemā'i, " +
        "ve Huves-Semi'ul-'Alim.",
      translation: "U ime Allaha, s čijim imenom ništa na Zemlji ni na nebu ne može nauditi, a On sve čuje i sve zna.",
      source: "Hadis — Sunan Abi Dawud, 5088"
    },
    {
      id: "dova-md8",
      title: "#35",
      type: "dua",
      arabic: "رَبِّ إِنِّي لِمَا أَنْزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ",
      translation: "Gospodaru moj, meni je zaista potrebna svaka blagodat koju mi Ti pošalješ.",
      source: "Kur'an, 28:24"
    },
    {
      id: "dova-md9",
      title: "#36",
      type: "dua",
      arabic: "رَبِّ أَنْزِلْنِي مُنْزَلًا مُبَارَكًا وَأَنْتَ خَيْرُ الْمُنْزِلِينَ",
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
      title: "Allahume Ente Rabbi...",
      type: "dua",
      arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي، فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
      transliteration:
        "Allahume Ente Rabbi, la ilahe illa Ente, halakteni ve ene 'abduke, " +
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
        "Bismillahillezi la jedurru me'asmihi šej'un fil-erdi ve la fissemā'i, " +
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
     SEKCIJE — redoslijed na ekranu.
     Premjesti stavku u ovom nizu i aplikacija se sama presloži.
     -------------------------------------------------------------------------- */
  /* `icon` bira ikonicu iz registra ICONS u script.js:
     "book" | "loop" | "hands" | "moon" */
  const sections = [
    { id: "quran",   title: "Kur'an",  icon: "book",  kind: "quran" },
    { id: "zikr",    title: "Zikr",    icon: "loop",  kind: "list", items: zikr },
    { id: "dove",    title: "Dove",    icon: "hands", kind: "list", items: dove },
    { id: "navecer", title: "Navečer", icon: "moon",  kind: "list", items: navecer }
  ];
  
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
  module.exports = { sections: sections };
}
