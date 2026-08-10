"use client";

import { useEffect } from "react";

/**
 * Dernier filet : une erreur survenue dans le layout racine lui-même.
 *
 * `app/error.tsx` vit **à l'intérieur** du layout ; si c'est le layout qui
 * échoue, il ne peut rien rendre. Ce fichier remplace donc le document entier,
 * `<html>` et `<body>` compris — c'est pourquoi il les écrit lui-même.
 *
 * Aucun composant importé, aucune classe utilitaire : si la feuille de style
 * n'a pas pu être chargée, un `className` ne produirait rien. Les styles sont
 * donc en ligne, et le texte reste lisible quoi qu'il arrive. Cette page n'est
 * pas censée s'afficher un jour ; sa seule qualité utile est de ne dépendre de
 * rien.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GLOBAL_ERROR]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f4",
          color: "#1f1b16",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "28rem", padding: "1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            SiNote est momentanément indisponible
          </h1>
          <p style={{ color: "#6e6559", lineHeight: 1.6 }}>
            Une erreur inattendue nous empêche d&apos;afficher la page. Réessayez
            dans un instant.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#123551",
              color: "#ffffff",
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#a49a8b" }}>
              {`Référence de l'incident : ${error.digest}`}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
