# Aurin

Server (Cloudflare Worker v `src/`) a aplikace pro iPhone (`ios-native/`) projektu Aurin. Web je na [aurin.health](https://aurin.health).

Copyright © 2026 Aurin. Všechna práva vyhrazena. Kód je veřejně viditelný, ale není pod žádnou licencí: bez písemného svolení ho nelze kopírovat, upravovat ani šířit.

## Lokálně

Potřebuješ Node 22.

```sh
npm test              # testy
npm run check         # kontrola syntaxe
npm run dev           # wrangler dev; tajné hodnoty patří do .dev.vars
```

Na produkci se nasazuje jen přes GitHub Actions po pushi do `main`. Aplikaci pro iPhone sestavuje GitHub Actions, postup je v `ios-native/README.md`.

Texty pro AI jsou v soukromém repozitáři a do `src/private` se stahují zvlášť, bez nich testy ani server nepoběží.

Tajné hodnoty (klíče a hesla) se nastavují v Cloudflare a v GitHub Actions secrets, nikdy ne v repozitáři.

## Dokumentace

- `docs/methodology.md`: metody a zdroje výpočtů.
- `docs/multi-user-setup.md`: uživatelé a připojení služeb.
- `docs/workout-library.md`, `docs/cycling-coach-v2.md`, `docs/adaptive-planning.md`: tréninky a plánování.
- `docs/food-data-sources.md`, `docs/food-catalog-database.md`: data o potravinách.
