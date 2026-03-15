import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 1000;

const normalizeWord = (value) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z]/g, '');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORDS_FILE = process.env.WORDS_FILE ?? 'data/words_fr.txt';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Variables manquantes: SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const run = async () => {
  const raw = await fs.readFile(WORDS_FILE, 'utf-8');
  const uniqueWords = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((line) => normalizeWord(line))
        .filter((word) => word.length > 1)
    )
  );

  console.log(`📚 ${uniqueWords.length} mots normalisés à importer depuis ${WORDS_FILE}`);

  let inserted = 0;
  for (let i = 0; i < uniqueWords.length; i += BATCH_SIZE) {
    const chunk = uniqueWords.slice(i, i + BATCH_SIZE).map((word) => ({ word }));
    const { error } = await supabase.from('words').upsert(chunk, { onConflict: 'word', ignoreDuplicates: true });
    if (error) {
      console.error(`❌ Erreur batch ${i / BATCH_SIZE + 1}:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`✅ Progression: ${inserted}/${uniqueWords.length}`);
  }

  console.log('🎉 Import terminé');
};

run().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
