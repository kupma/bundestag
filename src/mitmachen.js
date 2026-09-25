// The "Mitmachen" page: small, practical ways to contribute to something good –
// for yourself, with others, and in politics. Written to be useful whatever
// party someone votes for: no recommendations for or against a party, no
// moralising, and only facts that hold everywhere in Germany. Every link is a
// key into RESOURCES, so the addresses live in one place.

export const THEMES = [
  {
    id: 'gelassen',
    title: 'Gelassen informiert bleiben',
    teaser: 'Nachrichten ohne Dauerstress: weniger Eilmeldungen, mehr Überblick.',
    intro:
      'Informiert sein heißt nicht, alles sofort zu wissen. Ein ruhiger Blick auf das, was wirklich beschlossen wurde, hilft oft mehr als die zehnte Eilmeldung.',
    tips: [
      {
        title: 'Einmal am Tag reicht',
        text: 'Such dir eine feste Zeit für Nachrichten – zum Beispiel morgens beim Kaffee – und schalte Eilmeldungen auf dem Handy aus. Was wichtig ist, erreicht dich trotzdem.',
        levels: ['alltag'],
      },
      {
        title: 'Erst lesen, dann teilen',
        text: 'Überschriften spitzen zu. Lies den ganzen Text, bevor du ihn weiterleitest, und frag dich, ob die Quelle nachvollziehbar ist.',
        levels: ['alltag'],
      },
      {
        title: 'Zur Quelle gehen',
        text: 'Was der Bundestag beschlossen hat, steht in Drucksachen und Plenarprotokollen. Wir verlinken sie in jedem Artikel – ein Blick hinein ist oft beruhigender als jede Zusammenfassung.',
        levels: ['alltag'],
        links: ['dip'],
      },
      {
        title: 'Auf Gemeinsamkeiten achten',
        text: 'Viele Beschlüsse fallen mit breiter Mehrheit oder sogar einstimmig. Das wird selten zur Schlagzeile, gehört aber zum Bild. Unsere Artikel sagen es dazu.',
        levels: ['alltag'],
      },
      {
        title: 'Hintergründe ohne Aufregung',
        text: 'Die Bundeszentrale für politische Bildung erklärt Themen überparteilich und kostenlos – vom Gesetzgebungsverfahren bis zur Wirtschaftspolitik.',
        levels: ['alltag'],
        links: ['bpb'],
      },
    ],
  },
  {
    id: 'einkaufen',
    title: 'Einkaufen mit Wirkung',
    teaser: 'Kleine Entscheidungen im Supermarkt, die Geld sparen und etwas bewirken.',
    intro:
      'Jeder Einkauf ist eine kleine Entscheidung. Niemand muss alles richtig machen – such dir eine Sache aus, die zu deinem Alltag und deinem Geldbeutel passt.',
    tips: [
      {
        title: 'Weniger wegwerfen',
        text: 'Das Mindesthaltbarkeitsdatum ist kein Wegwerfdatum: anschauen, riechen, probieren. Streng gilt nur „zu verbrauchen bis“, etwa bei Hackfleisch. Das spart Geld und Ressourcen.',
        levels: ['alltag'],
        links: ['zu_gut_fuer_die_tonne'],
      },
      {
        title: 'Saisonal und regional',
        text: 'Obst und Gemüse der Saison sind oft günstiger und haben kürzere Wege hinter sich. Ein Saisonkalender hilft beim Planen.',
        levels: ['alltag'],
        links: ['verbraucherzentrale'],
      },
      {
        title: 'Siegel verstehen',
        text: 'EU-Bio-Logo, Fairtrade bei Kaffee, Kakao und Bananen, MSC und ASC bei Fisch, die Haltungsform bei Fleisch: Siegel sagen Unterschiedliches aus. Wer sie kennt, entscheidet selbst.',
        levels: ['alltag'],
        links: ['lebensmittelklarheit'],
      },
      {
        title: 'Der Code auf dem Ei',
        text: 'Die erste Ziffer des Stempels verrät die Haltung: 0 steht für Bio, 1 für Freiland, 2 für Boden- und 3 für Käfighaltung.',
        levels: ['alltag'],
      },
      {
        title: 'Mehrweg erkennen',
        text: '25 Cent Pfand bedeuten Einweg. Mehrwegflaschen kosten meist 8 oder 15 Cent Pfand und werden viele Male neu befüllt.',
        levels: ['alltag'],
      },
      {
        title: 'Leitungswasser trinken',
        text: 'Trinkwasser gehört in Deutschland zu den am besten kontrollierten Lebensmitteln. Es ist günstig und muss nicht erst transportiert werden.',
        levels: ['alltag'],
      },
      {
        title: 'Grundpreis vergleichen',
        text: 'Am Regal steht der Preis pro Kilo oder Liter. Damit siehst du auf einen Blick, ob die große Packung wirklich günstiger ist.',
        levels: ['alltag'],
      },
      {
        title: 'Gemeinsam einkaufen',
        text: 'Foodsharing, solidarische Landwirtschaft oder eine Einkaufsgemeinschaft im Haus: Zusammen wird es oft günstiger – und geselliger.',
        levels: ['gemeinsam'],
      },
    ],
  },
  {
    id: 'demokratie',
    title: 'Demokratie im Alltag',
    teaser: 'Nachfragen, mitreden, mitmachen – nicht nur am Wahltag.',
    intro:
      'Demokratie ist mehr als alle paar Jahre ein Kreuz. Sie lebt davon, dass Menschen fragen, mitreden und mitmachen – ganz gleich, welche Partei sie wählen.',
    tips: [
      {
        title: 'Wisse, wer dich vertritt',
        text: 'Für jeden Wahlkreis sitzen Abgeordnete im Bundestag, oft aus mehreren Parteien. Finde heraus, wer für deine Region zuständig ist.',
        levels: ['politik'],
        links: ['abgeordnete'],
      },
      {
        title: 'Frag nach',
        text: 'Abgeordnete beantworten Fragen von Bürgerinnen und Bürgern – per Brief, per Mail oder öffentlich. Kurz, konkret und freundlich kommt ein Anliegen am besten an.',
        levels: ['politik'],
        links: ['abgeordnetenwatch'],
      },
      {
        title: 'Petition einreichen oder mitzeichnen',
        text: 'Nach Artikel 17 des Grundgesetzes darf sich jeder Mensch mit Bitten und Beschwerden an den Bundestag wenden. Der Petitionsausschuss muss sich damit befassen.',
        levels: ['politik'],
        links: ['petition'],
      },
      {
        title: 'Den Bundestag besuchen',
        text: 'Plenarsitzungen sind öffentlich. Mit Anmeldung kannst du kostenlos von der Besuchertribüne aus zuschauen.',
        levels: ['politik'],
        links: ['bundestag_besuch'],
      },
      {
        title: 'Vor Ort mitreden',
        text: 'Sitzungen des Gemeinde- oder Stadtrats sind in der Regel öffentlich, und viele haben eine Einwohnerfragestunde. Hier wird entschieden, was du direkt vor der Haustür merkst.',
        levels: ['politik', 'gemeinsam'],
      },
      {
        title: 'Bei Wahlen helfen',
        text: 'Bei jeder Wahl suchen die Gemeinden Menschen, die im Wahllokal helfen und die Stimmen auszählen. Melde dich bei deiner Stadt- oder Gemeindeverwaltung.',
        levels: ['politik', 'gemeinsam'],
      },
      {
        title: 'Schöffin oder Schöffe werden',
        text: 'Ehrenamtliche Richterinnen und Richter entscheiden in Strafprozessen mit. Gewählt wird alle fünf Jahre; Bewerbungen nehmen die Gemeinden entgegen.',
        levels: ['politik'],
      },
      {
        title: 'Gesetze im Original lesen',
        text: 'Alle Bundesgesetze stehen kostenlos im Internet. So kannst du selbst nachlesen, was wirklich gilt.',
        levels: ['alltag'],
        links: ['gesetze'],
      },
    ],
  },
  {
    id: 'miteinander',
    title: 'Miteinander',
    teaser: 'Nachbarschaft, Ehrenamt und fair streiten – auch am Familientisch.',
    intro:
      'Gesellschaft entsteht zwischen Menschen – im Treppenhaus, im Verein, am Küchentisch. Kleine Gesten bewirken oft mehr als große Worte.',
    tips: [
      {
        title: 'Nachbarschaft pflegen',
        text: 'Klingeln, Hilfe anbieten, ein Tauschregal im Hausflur: Wer seine Nachbarn kennt, fühlt sich sicherer und weniger allein.',
        levels: ['gemeinsam'],
      },
      {
        title: 'Ein Ehrenamt, das passt',
        text: 'Ob eine Stunde im Monat oder jede Woche: Freiwilligenagenturen vermitteln Engagement in deiner Nähe.',
        levels: ['gemeinsam'],
        links: ['freiwilligenagenturen'],
      },
      {
        title: 'Bei der Tafel helfen',
        text: 'Tafeln retten Lebensmittel und geben sie an Menschen mit wenig Geld weiter. Helfende Hände werden fast überall gesucht.',
        levels: ['gemeinsam'],
        links: ['tafel'],
      },
      {
        title: 'Blut spenden',
        text: 'Eine Blutspende dauert mit allem Drumherum etwa eine Stunde und kann Leben retten. Termine gibt es in fast jeder Stadt.',
        levels: ['gemeinsam'],
        links: ['blutspende'],
      },
      {
        title: 'Mit Plan spenden',
        text: 'Das DZI-Spenden-Siegel zeigt, dass eine Organisation sorgfältig und transparent mit Spenden umgeht.',
        levels: ['alltag'],
        links: ['dzi'],
      },
      {
        title: 'Fair streiten',
        text: 'Frag nach, bevor du widersprichst, und such zuerst das Gemeinsame. Hart in der Sache, freundlich im Ton – das entspannt jedes Gespräch, auch am Familientisch.',
        levels: ['gemeinsam'],
      },
      {
        title: 'Zeit schenken',
        text: 'Ein Anruf bei den Großeltern, ein Besuch bei der älteren Nachbarin: Einsamkeit ist weit verbreitet, und oft hilft schon ein Gespräch.',
        levels: ['gemeinsam'],
      },
    ],
  },
];
