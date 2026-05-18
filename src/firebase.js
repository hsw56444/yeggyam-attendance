import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase 콘솔에서 발급받은 실제 설정 값으로 교체해 주세요.
const firebaseConfig = {
  apiKey: "AIzaSyDMK-Ezh0ak2DbsLoaCxceMAiGXCX7aEdo",
  authDomain: "yeggyam-attendance.firebaseapp.com",
  projectId: "yeggyam-attendance",
  storageBucket: "yeggyam-attendance.firebasestorage.app",
  messagingSenderId: "135565622021",
  appId: "1:135565622021:web:f682499c0156986c22d56c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);