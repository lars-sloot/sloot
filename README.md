# Sloot pakbonnen — productie-app

Next.js-webapp voor mobiel en desktop met Supabase Auth, Postgres, Row Level Security en private Storage.

## Wat al is ingericht

- Beheerder en gebruiker
- Gebruikers aan meerdere filialen koppelen
- Beheerder ziet alle filialen; gebruiker alleen toegewezen filialen
- Pakbonstatussen: verwerken, controleren, geaccordeerd en afgewezen
- Afwijzen vereist een reden
- Activiteitenlog met voor- en nasituatie
- Private foto-opslag, handmatige verwijdering door beheerder en bewaartermijn van één jaar
- Filialen Delden, Borne en Tubbergen
- Server-side OpenAI-sleutel voorbereid

## Eenmalige installatie

1. Maak een Supabase-project in een EU-regio.
2. Open **SQL Editor** en voer `supabase/migrations/202609220001_initial_schema.sql` uit.
3. Maak in Supabase Authentication de eerste gebruiker. De database-trigger maakt de allereerste gebruiker automatisch beheerder en koppelt alle filialen.
4. Zet daarna in Supabase Authentication openbare registratie uit. Nieuwe accounts worden vanuit het beheerdersscherm gemaakt.
5. Kopieer `.env.example` naar `.env.local` en vul lokaal de waarden in.
6. Voeg dezelfde variabelen toe aan Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` en `OPENAI_API_KEY`.
7. Importeer de repository in Vercel en deploy.

Plak `SUPABASE_SERVICE_ROLE_KEY` en `OPENAI_API_KEY` nooit in broncode, Git of een chatbericht.

## Lokaal controleren

```bash
pnpm install
pnpm dev
```

Productiebuild:

```bash
pnpm exec next build --webpack
```


## Pakbonoverzichten en testmails via SMTP

Stel in Vercel bij **sloot-pakbonnen → Settings → Environment Variables** de volgende servervariabelen in voor **Production**. Gebruik voor Preview uitsluitend een apart testaccount. Voer daarna een nieuwe deployment uit.

| Variabele | Waarde |
| --- | --- |
| `SMTP_HOST` | SMTP-servernaam van de mailprovider, zonder `https://` |
| `SMTP_PORT` | `587` voor STARTTLS of `465` voor directe TLS |
| `SMTP_USER` | SMTP-gebruikersnaam, vaak het volledige e-mailadres |
| `SMTP_PASSWORD` | SMTP-wachtwoord of een app-wachtwoord; markeer als Sensitive |
| `SMTP_SECURE` | `false` bij poort 587; `true` bij poort 465. Zonder deze variabele wordt 465 automatisch als TLS herkend. |
| `EMAIL_FROM` | Toegestaan afzenderadres, bijvoorbeeld `Sloot pakbonnen <pakbonnen@sloot2wielers.nl>` |
| `NEXT_PUBLIC_APP_URL` | Het websiteadres voor de links in de mail, bijvoorbeeld `https://pakbonnen.sloot2wielers.nl` |

De app gebruikt voor pakbonoverzichten en de knop **Nu testmail versturen** geen Resend meer. De bestaande planning en e-mailinhoud blijven behouden. Een succesvolle test betekent dat de SMTP-server de mail heeft geaccepteerd; controleer daarnaast de inbox en eventuele spammap.

De verbinding moet TLS ondersteunen en het certificaat moet geldig zijn. Gebruik een afzender waarvoor het SMTP-account verzendrechten heeft. Wachtwoorden horen alleen in Vercel of een lokale, niet-gecommitteerde `.env.local`, nooit in Git of chat.

**Resetmails en uitnodigingen** worden apart door Supabase Auth verzonden. Vul dezelfde SMTP-servergegevens daar in bij de Custom SMTP-instellingen. Vercel-variabelen wijzigen de Supabase-instellingen niet.

Geplande berichten krijgen een stabiele Message-ID. Het activiteitenlog wordt gecontroleerd om opnieuw afgeleverde queue-opdrachten die al zijn verzonden over te slaan. Een fout bij het vastleggen na SMTP-acceptatie veroorzaakt geen directe herverzending. SMTP biedt geen algemene garantie op precies één aflevering: bij een verbroken verbinding rond acceptatie kan een herhaalde poging alsnog een dubbele mail opleveren.

Controle:

```bash
node --test tests/*.test.mjs
npm run lint
npm run build -- --webpack
```

## Foto-compressie bij nieuwe uploads

Nieuwe grote JPG-, PNG- en door de browser leesbare HEIC-foto's worden op het apparaat voorbereid voordat ze worden verstuurd. De app probeert WebP op kwaliteit 0,92; als de browser geen WebP kan maken, wordt JPEG geprobeerd. Gewone documentfoto's krijgen maximaal 4096 pixels aan de langste zijde, zonder vergroten en met behoud van de beeldverhouding en EXIF-oriëntatie. Lange bonnen (verhouding groter dan 2:1) behouden hun pixelafmetingen om kleine tekst te beschermen.

Alleen resultaten die minstens 10% kleiner zijn worden gebruikt. Bestanden onder 200 KiB, bestaande WebP en PDF blijven ongewijzigd. Als een browser het formaat niet kan verwerken, wordt het origineel behouden en krijgt de gebruiker een melding. Pagina's worden achter elkaar verwerkt om het geheugengebruik op telefoons te beperken; een hervatte upload comprimeert eerder voorbereide foto's niet opnieuw.

Supabase ontvangt uitsluitend het gekozen uploadbestand, met bijpassende extensie en MIME-type. Er wordt geen tweede origineel opgeslagen. De bestaande AI-verwerking, weergave en bewaartermijn blijven gelden. Deze wijziging past bestaande bestanden in Storage niet aan. Leesbaarheid hangt ook af van de oorspronkelijke scherpte en belichting: compressie herstelt geen onscherpe foto.
