import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'mock-medical-imaging-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/api/medical/imaging/search')) {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const query = (urlObj.searchParams.get('q') || '').toLowerCase().trim();
            
            const catalogue = [
              { id: "RAD-01", code: "72106-7", label: "Radiographie du thorax de face" },
              { id: "RAD-02", code: "36643-5", label: "Scanner thoracique sans injection" },
              { id: "RAD-03", code: "24627-2", label: "Scanner crânien sans injection" },
              { id: "RAD-04", code: "36801-9", label: "IRM cérébrale avec injection de gadolinium" },
              { id: "RAD-05", code: "24876-5", label: "Échographie abdominale complète" },
              { id: "RAD-06", code: "36688-0", label: "Radiographie du rachis lombaire" },
              { id: "RAD-07", code: "36969-4", label: "Échographie pelvienne par voie sus-pubienne" },
              { id: "RAD-08", code: "24725-4", label: "Scanner abdominopelvien avec injection" },
              { id: "RAD-09", code: "44139-4", label: "Mammographie bilatérale de dépistage" },
              { id: "RAD-10", code: "36862-1", label: "Angio-IRM des vaisseaux du cou" }
            ];

            let results = catalogue;
            if (query) {
              results = catalogue.filter(item => 
                item.label.toLowerCase().includes(query) || 
                item.code.toLowerCase().includes(query)
              );
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(results.slice(0, 10), null, 2));
            return;
          }
          if (req.url && req.url.includes('/triage/structured-acts-rules')) {
            const mockResponse = {
              status: "success",
              mode: "rules_engine",
              timestamp: new Date().toISOString(),
              actes_proposes: [
                { id: "ACT-01", code_loinc: "72106-7", acte: "Radiographie thoracique de face", justification: "Suspicion d'infection pulmonaire ou épanchement devant la fièvre et la toux", priorite: "Haute" },
                { id: "ACT-02", code_loinc: "20565-8", acte: "NFS / Plaquettes", justification: "Évaluation d'un syndrome infectieux ou anémique", priorite: "Haute" },
                { id: "ACT-03", code_loinc: "1988-5", acte: "CRP (Protéine C-Réactive)", justification: "Marqueur de cinétique inflammatoire", priorite: "Moyenne" },
                { id: "ACT-04", code_loinc: "2951-2", acte: "Ionogramme sanguin", justification: "Recherche de troubles électrolytiques suite aux pertes digestives (diarrhées/vomissements)", priorite: "Haute" }
              ],
              regles_cliniques: [
                { id: "RUL-01", regle: "Règle de réhydratation OMS (Plan C)", description: "Devant un tableau de déshydratation sévère avec troubles hémodynamiques, mise en place immédiate d'une voie veineuse et perfusion de Ringer Lactate.", niveau_preuve: "Grade A" },
                { id: "RUL-02", regle: "Antibiothérapie probabiliste précoce", description: "En cas de sepsis ou de foyer infectieux suspecté chez le nourrisson de moins de 2 ans, ne pas retarder la première dose d'antibiotique par l'attente des résultats de laboratoire.", niveau_preuve: "Grade B" }
              ],
              pieges_a_eviter: [
                { id: "PIT-01", categorie: "Prescription", alerte: "Attention au risque de surcharge hydrique chez l'enfant dénutri ou présentant des œdèmes (kwashiorkor) lors de la réhydratation IV rapide." },
                { id: "PIT-02", categorie: "Diagnostic", alerte: "Ne pas méconnaître un accès palustre grave devant une fièvre élevée en zone d'endémie, réaliser un TDR Paludisme en urgence." }
              ],
              diagnostics_differentiels: [
                { cim10: "A09", libelle: "Gastro-entérite d'origine présumée infectieuse", probabilite: "Élevée" },
                { cim10: "B50.8", libelle: "Paludisme à Plasmodium falciparum avec formes digestives", probabilite: "Élevée" },
                { cim10: "E40", libelle: "Kwashiorkor (Malnutrition protéino-énergétique sévère avec œdèmes)", probabilite: "Modérée" },
                { cim10: "A03.9", libelle: "Shigellose (Dysenterie bacillaire)", probabilite: "Faible à modérée" }
              ],
              scores_calcules: {
                news2_pediatrique: { score: 8, interpretation: "Risque clinique élevé, surveillance continue requise" },
                deshydratation: { stade: "Sévère", criteres_presents: ["Refus de boire", "Vomissements répétés", "Diarrhées abondantes"] }
              }
            };

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(mockResponse, null, 2));
            return;
          }
          next();
        });
      }
    }
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.meddocta.com',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
