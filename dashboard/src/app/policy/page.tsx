import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Panel } from "@/components/ui/Panel";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Official Statement Regarding Data Processing and Privacy Practices",
};

export default async function PolicyPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          Privacy Policy
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Official Statement Regarding Data Processing and Privacy Practices
        </p>
        <p className="mt-2 text-sm text-muted">
          Effective Date: February 3, 2026
        </p>

        <div className="mt-10 space-y-6">
          <Panel className="p-8">
            <p className="leading-relaxed text-muted">
              This Privacy Policy (&quot;Policy&quot;) constitutes a legal
              agreement between you (&quot;User,&quot; &quot;you,&quot; or
              &quot;your&quot;) and the development team of Fortuna Bot
              (&quot;Service Provider,&quot; &quot;we,&quot; &quot;us,&quot;
              or &quot;our&quot;). This Policy elucidates our practices
              regarding the collection, use, disclosure, and protection of
              your Personal Data in connection with your use of the Fortuna
              Bot services on the Discord platform (&quot;Service&quot;).
              <br />
              <br />
              By accessing or using the Service, you expressly consent to the
              data processing practices described in this Policy. If you do
              not agree to the terms of this Policy, you must strictly
              refrain from using the Service.
            </p>
          </Panel>

          <PolicySection title="1. Collection of Data">
            <p>
              We collect Specific Categories of Personal Data necessary for
              the operation of the Service, as classified below:
            </p>

            <div>
              <h3 className="mb-2 font-bold text-ink">
                1.1. User-Provided Information
              </h3>
              <p className="mb-2">
                We collect data that you voluntarily submit through direct
                interaction with the Service:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-ink">Identity Data:</strong>{" "}
                  Discord User ID, Username, Discriminator, and Avatar URL.
                </li>
                <li>
                  <strong className="text-ink">Transaction Data:</strong>{" "}
                  Records of virtual currency transactions, inventory
                  acquisitions, bank deposits, and credit card activity.
                </li>
                <li>
                  <strong className="text-ink">Configuration Data:</strong>{" "}
                  Server-specific settings, preferences, and permissions
                  configured by administrative users.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-bold text-ink">
                1.2. Automated Data Collection
              </h3>
              <p className="mb-2">
                Upon interaction with the Service, the following data is
                automatically generated and retained:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-ink">Metadata:</strong> Timestamps
                  of account creation, command usage logs, and interaction
                  frequency.
                </li>
                <li>
                  <strong className="text-ink">Guild Data:</strong> Discord
                  Server (Guild) IDs and channel associations required for
                  segregated economy management.
                </li>
              </ul>
            </div>
          </PolicySection>

          <PolicySection title="2. Purpose and Legal Basis of Processing">
            <p>
              We process Personal Data under the following legal bases and
              for the specific purposes outlined herein:
            </p>
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <strong className="text-ink">Contractual Necessity:</strong>{" "}
                To fulfill our obligations under these Terms, including
                maintaining your virtual account balance, inventory, and
                progress.
              </li>
              <li>
                <strong className="text-ink">Legitimate Interests:</strong> To
                analyze Service performance, prevent fraudulent activity
                (including automated &quot;farming&quot; or exploitation),
                and enforce our Terms of Service.
              </li>
              <li>
                <strong className="text-ink">
                  Compliance with Legal Obligations:
                </strong>{" "}
                To comply with applicable laws, regulations, or valid legal
                processes (e.g., subpoenas or court orders).
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="3. Disclosure of Information">
            <p>
              We adhere to a strict policy regarding the disclosure of your
              Personal Data:
            </p>
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <strong className="text-ink">No Commercial Transfer:</strong>{" "}
                We do not sell, license, lease, or commercially transfer User
                Data to third-party advertisers or data brokers.
              </li>
              <li>
                <strong className="text-ink">Service Providers:</strong> We
                may disclose data to third-party infrastructure providers
                (e.g., cloud hosting services, database management systems)
                solely for the purpose of hosting and maintaining the
                Service. These providers are bound by confidentiality
                agreements.
              </li>
              <li>
                <strong className="text-ink">Legal Requirements:</strong> We
                reserve the right to disclose data when we have a good-faith
                belief that such action is necessary to comply with a
                judicial proceeding, court order, or legal process served on
                us.
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="4. Data Security and Retention">
            <p>
              We implement industry-standard technical and organizational
              measures designed to protect your Personal Data from
              unauthorized access, accidental loss, disclosure, or
              destruction. These measures include encryption in transit and
              rest, strict access controls, and regular security audits.
            </p>
            <p>
              We retain Personal Data only for as long as is necessary to
              fulfill the purposes for which it was collected, including for
              the purposes of satisfying any legal, accounting, or reporting
              requirements. Upon account deletion or termination, data is
              expunged from our active databases in accordance with our
              retention schedule.
            </p>
          </PolicySection>

          <PolicySection title="5. User Rights and Control">
            <p>
              Subject to applicable law, you possess the following rights
              regarding your Personal Data:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">Right to Access:</strong> You
                may request a copy of the Personal Data we hold about you via
                the{" "}
                <code className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-sm text-ink">
                  !profile
                </code>{" "}
                command.
              </li>
              <li>
                <strong className="text-ink">
                  Right to Erasure (&quot;Right to be Forgotten&quot;):
                </strong>{" "}
                You may request the permanent deletion of your data. The
                Service provides the{" "}
                <code className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-sm text-ink">
                  !reset-economy
                </code>{" "}
                command for Administrators to purge server-specific data.
                Individual deletion requests may be submitted via our Support
                Server.
              </li>
              <li>
                <strong className="text-ink">Right to Rectification:</strong>{" "}
                You have the right to request correction of inaccurate or
                incomplete data.
              </li>
            </ul>
          </PolicySection>

          <PolicySection title="6. International Data Transfers">
            <p>
              The Service is hosted on infrastructure located in the United
              States and potentially other jurisdictions. By using the
              Service, you acknowledge and consent to the transfer of your
              data to, and processing in, jurisdictions that may have
              different data protection laws than your jurisdiction of
              residence.
            </p>
          </PolicySection>

          <PolicySection title="7. Amendments">
            <p>
              We reserve the right to modify this Policy at our sole
              discretion. Material changes will be notified via the Service
              or our official support channels. Your continued use of the
              Service following such notification constitutes your explicit
              acceptance of the amended Policy.
            </p>
          </PolicySection>

          <PolicySection title="Contact Information">
            <p>
              For inquiries regarding this Policy or to exercise your data
              rights, please contact our Data Protection Officer via our
              official Support Server.
            </p>
            <a
              href="https://discord.gg/Y5P44UCH2Y"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium text-gold hover:text-gold-deep"
            >
              Join Support Server
            </a>
          </PolicySection>
        </div>
      </div>

      <Footer />
    </main>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-8">
      <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted">
        {children}
      </div>
    </Panel>
  );
}
