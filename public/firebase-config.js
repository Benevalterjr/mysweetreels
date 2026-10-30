// Firebase Web SDK integration for SweetReels frontend
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCNNDNYhza5hpDcliDpPnY9bY0QPf1e96o",
  authDomain: "studio-1211123919-7a14e.firebaseapp.com",
  projectId: "studio-1211123919-7a14e",
  storageBucket: "studio-1211123919-7a14e.firebasestorage.app",
  messagingSenderId: "1092118003439",
  appId: "1:1092118003439:web:8070a91bed781a36d5e51a"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Busca todos os Reels do Firestore ordenados por data de criação.
 * Retorna array de objetos ou lança erro para fallback local.
 */
export async function fetchReelsFromFirestore() {
  try {
    const reelsRef = collection(db, "reels");
    const q = query(reelsRef);
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return [];
    
    const reels = [];
    snapshot.forEach(docSnap => {
      reels.push({ id: docSnap.id, ...docSnap.data() });
    });
    
    // Ordena do mais recente para o mais antigo por created_at
    reels.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return reels;
  } catch (err) {
    console.warn("Aviso: Falha ao carregar do Firestore, usando fallback local:", err);
    throw err;
  }
}
