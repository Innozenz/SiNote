import type { Metadata } from "next";
import { Cormorant, Inter, Pinyon_Script } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

/** Corps de texte : Inter, grotesque neutre, très lisible aux petites tailles. */
const sans = Inter({
  variable: "--font-sans-custom",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Titres : c'est là que vit le caractère de la marque. Cormorant, un serif
 * haute-classe à fort contraste, réservé aux h1-h3 — registre « affiche de
 * concert / conservatoire ». On charge quelques graisses et l'italique (accents
 * dorés) plutôt que tout le fichier.
 */
const display = Cormorant({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Signature : Pinyon Script, une anglaise copperplate. Réservée à une seule
 * chose — signer un avis du prénom de l'élève, comme une vraie main. Rationnée
 * comme le bronze : partout ailleurs, ce serait du décor.
 */
const signature = Pinyon_Script({
  variable: "--font-signature-custom",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  // Base absolue : sans elle, les canonical et les images OpenGraph des pages
  // publiques restent relatifs et sont inexploitables par les moteurs et les
  // réseaux sociaux.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  title: {
    default:
      "SiNote — cours de musique, chant, MAO et DJ : réservez en ligne",
    // Les pages publiques ne fixent que leur propre titre.
    template: "%s | SiNote",
  },
  description:
    "Trouvez un professeur de musique, de chant, de MAO, de DJ ou de beatmaking, consultez ses disponibilités et réservez votre cours en ligne. Vous réglez le prof directement, sans commission.",
  // Mots-clés cœur de cible. Google ne les lit plus pour le classement, mais
  // d'autres moteurs et agrégateurs les exploitent encore, et le coût est nul.
  keywords: [
    "cours de musique",
    "cours de chant",
    "cours de guitare",
    "cours de piano",
    "cours de DJ",
    "cours de MAO",
    "beatmaking",
    "réservation en ligne cours de musique",
    "professeur de musique",
    "école de musique",
    "prof de musique en ligne",
  ],
  openGraph: {
    siteName: "SiNote",
    locale: "fr_FR",
    type: "website",
  },
  // Les partages génèrent une grande vignette (image OG par défaut définie par
  // app/opengraph-image.tsx).
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${sans.variable} ${display.variable} ${signature.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
