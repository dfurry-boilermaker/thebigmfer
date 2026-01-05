# Manager Analyses

Manager analyses are stored in `managers.json` alongside each manager's name and stock symbol.

## How to Use

1. **Edit the file**: Open `managers.json`
2. **Find the manager**: Locate the manager you want to edit
3. **Replace placeholder text**: Replace the `"analysis"` field with their actual analysis
4. **Save the file**: The changes will be reflected on the website

## Format

Each manager entry in `managers.json` should look like this:

```json
{
  "name": "ManagerName",
  "stockSymbol": "SYMBOL",
  "analysis": "Their analysis here. A couple of sentences explaining why they picked this stock and their investment thesis."
}
```

## Example

```json
{
  "name": "Kyle",
  "stockSymbol": "PLTR",
  "analysis": "I believe Palantir is positioned to dominate the AI data analytics space. Their government contracts provide stable revenue, while their commercial growth shows strong potential. The company's unique data platform gives them a competitive moat that will be difficult for competitors to replicate."
}
```

## Notes

- The analysis will only show if it's filled in (not the placeholder text)
- Keep analyses to 2-3 sentences for best readability
- The analysis appears in a dropdown section below each manager's performance data
- Users can click "View Analysis" to expand and see the full text
- If a manager doesn't have an analysis, the dropdown won't appear for them

## Current Managers

All managers are defined in `managers.json`:
- Daniel (NBIS)
- Sam (NVDA)
- Szklarek (WY)
- Cale (NVO)
- Charlie (TSLA)
- Kruse (AMTM)
- Kyle (PLTR)
- Adam (JPM)
- Carson (AMZN)
- Grant (WM)
- Nick (PM)
- Pierino (CRCL)

