import { ProjectStore } from '../store/projectStore';
import { generateStringingGuidePdf, prefetchStringingBasemap } from '../report/stringingGuide';

function remembered(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

/** Builds the installer stringing guide and downloads it as a PDF. */
export async function downloadStringingGuide(store: ProjectStore, systemId: string = 'all'): Promise<void> {
  const basemap = await prefetchStringingBasemap(store, { systemId });
  const doc = generateStringingGuidePdf(store, {
    systemId,
    basemap,
    clientName: remembered('sgp_report_client_name'),
    engineerName: remembered('sgp_report_engineer_name')
  });
  const safeName = (store.projectName || 'Solar_Project').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeName}_Array_Stringing_Guide_${new Date().toISOString().slice(0, 10)}.pdf`);
}
