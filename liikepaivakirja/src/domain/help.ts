/* domain/help — the help text, as data.
 *
 * Content rather than logic, but it lives in the domain layer for the same reason
 * taxonomy.ts does: it is plain data with no React in it, so it can be asserted
 * against in tests. There is a test that fails if the storage section stops
 * mentioning backups, because that is the one sentence in here that a user cannot
 * afford to miss, and it is exactly the sort of thing that gets trimmed for
 * length by someone tidying up later.
 *
 * Two audiences, which is why the tone is not purely instructional. The obvious
 * one is a person opening the app for the first time. The other is a
 * physiotherapist who has been sent the URL or a report and wants to know what
 * they are looking at — hence "Mikä tämä on" leading with what the app does *not*
 * claim to be.
 *
 * Kept deliberately short. Help nobody reads because it is a wall of text is
 * worse than no help, so every section is a few sentences and the whole thing is
 * collapsed by default. A test caps paragraph length to keep that honest.
 */

export type HelpSection = {
  id: string;
  title: string;
  body: string[];
  /* one highlighted line, for the thing in that section that actually matters */
  note?: string;
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "what",
    title: "Mikä tämä on",
    body: [
      "Oma päiväkirja fysioterapiaharjoituksista ja oireista. Liikkeet, annokset ja tiheydet tulevat sinun fysioterapeutiltasi — sovellus vain pitää kirjaa siitä, mitä on tehty ja miltä on tuntunut.",
      "Sovellus ei arvioi, onko kipu hyväksyttävää tai pitäisikö annosta muuttaa. Se kokoaa tiedot yhdelle sivulle, jonka voi ottaa vastaanotolle. Tulkinta kuuluu ammattilaiselle.",
    ],
  },
  {
    id: "data",
    title: "Missä tiedot ovat",
    body: [
      "Vain tässä laitteessa, selaimen omassa tallennustilassa. Ei tiliä, ei palvelinta, ei kirjautumista. Kukaan muu ei näe merkintöjä eikä niitä lähetetä mihinkään.",
      "Kääntöpuoli: jos tyhjennät selaimen sivustotiedot tai vaihdat laitetta, päiväkirja katoaa mukana. Siksi varmuuskopio ei ole valinnainen.",
    ],
    note: "Muokkaa → Varmuuskopio tekee tiedostokopion, Muokkaa → Palautus lukee sen takaisin. Kokeile palautusta kerran, niin tiedät kopion toimivan.",
  },
  {
    id: "day",
    title: "Päivän kirjaus",
    body: [
      "Napauta liikkeen ympyrää, kun päivän annos on tehty, tai lisää sarjoja yksi kerrallaan. Annoksen yli menevät sarjat merkitään erikseen.",
      "”Merkitse ohjelma tehdyksi” täyttää kerralla kaiken tekemättömän sen päivän annoksen mukaan. Se ei vähennä jo kirjattua eikä koske liikkeisiin, joiden viikkotavoite on täynnä. Napautuksen voi kumota heti perään.",
      "Nuolilla pääsee edellisiin päiviin, joten unohtuneen päivän voi täydentää jälkikäteen.",
    ],
  },
  {
    id: "symptoms",
    title: "Oireet",
    body: [
      "Yksi napautus voimakkuudesta merkitsee sekä sen, että oire uusi, että kuinka paha se oli. Sama napautus uudelleen poistaa merkinnän.",
      "Laatu — jomotus, pistely, puutuminen, säteily — on vapaaehtoinen, mutta se on usein juuri se tieto, joka erottaa hermo-oireen lihasoireesta.",
    ],
  },
  {
    id: "dose",
    title: "Annos ja tiheys",
    body: [
      "Annos ja tiheys muokataan Muokkaa-välilehdellä. Muutos kirjautuu itsestään aikajanalle, jotta vastaanotolla näkyy milloin mikä muuttui.",
      "Jokainen päivä jäädyttää sen annoksen, joka oli silloin voimassa. Annoksen nostaminen ei siis muuta menneitä päiviä keskeneräisiksi.",
    ],
  },
  {
    id: "psfs",
    title: "PSFS — toimintakyky",
    body: [
      "Nimeät 3–5 arkista asiaa, joita vaiva haittaa, ja pisteytät ne 0–10 kahden viikon välein. Keskiarvo on luku, jonka fysioterapeutti tunnistaa mittarin nimestä PSFS.",
      "Kahden viikon väli on tarkoituksellinen: päivittäinen pisteytys tuottaisi heiluntaa, joka näyttää muutokselta mutta ei ole sitä.",
    ],
    note: "Keskiarvon merkittävän muutoksen rajat ovat noin 1,3 / 2,3 / 2,7 pistettä. Yksittäisen toiminnon kohdalla vasta noin 3 pistettä on luotettavasti havaittava muutos.",
  },
  {
    id: "report",
    title: "Raportti vastaanotolle",
    body: [
      "Historia → Raportti fysioterapeutille kokoaa yhdelle sivulle toteutuman, toimintakyvyn, oireet, annosmuutokset ja omat kysymyksesi. Sen voi tulostaa, ladata tiedostona tai kopioida tekstinä viestiin.",
      "Kirjoita kysymykset valmiiksi raporttiin ennen käyntiä. Se on koko sovelluksen tarkoitus: vastaanotolla ei tarvitse muistella.",
    ],
  },
  {
    id: "offline",
    title: "Offline ja päivitykset",
    body: [
      "Ensimmäisen onnistuneen latauksen jälkeen sovellus avautuu ilman verkkoa. Uusi versio ei vaihdu kesken käytön: siitä tulee ilmoitus ja lataat sen itse silloin kun sopii.",
      "Jos sovellus ei jostain syystä avaudu, lisää osoitteen perään ?sw=off ja avaa se selaimessa. Se purkaa offline-tilan poistamatta merkintöjä. Sama onnistuu kytkimestä Muokkaa-välilehdellä.",
    ],
  },
];

/* The first-run card says as little as possible: three facts and a way onward.
   Anything longer competes with the thing the person actually came to do. */
export const FIRST_RUN = {
  title: "Tervetuloa",
  lines: [
    "Liikkeet ja oireet ovat valmiina esimerkkeinä. Muokkaa ne Muokkaa-välilehdellä fysioterapeutin ohjeen mukaisiksi.",
    "Merkitse päivän liikkeet Tänään-välilehdellä. Yksi napautus riittää koko ohjelmaan.",
    "Tiedot pysyvät vain tässä laitteessa, joten tee varmuuskopio heti kun ohjelma on kohdallaan.",
  ],
};
