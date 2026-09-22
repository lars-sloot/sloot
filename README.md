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

