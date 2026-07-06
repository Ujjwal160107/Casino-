import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Panel } from "@/components/ui/Panel";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Legally Binding User Agreement",
};

export default async function TermsPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          Terms of Service
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Legally Binding User Agreement
        </p>
        <p className="mt-2 text-sm text-muted">
          Effective Date: February 3, 2026
        </p>

        <div className="mt-10 space-y-6">
          <Panel className="p-8">
            <p className="leading-relaxed text-muted">
              THESE TERMS OF SERVICE (&quot;TERMS&quot;) CONSTITUTE A BINDING
              LEGAL AGREEMENT BETWEEN YOU AND THE FORTUNA BOT DEVELOPMENT
              TEAM. BY INVITING THE BOT TO A SERVER, EXECUTING ANY COMMAND, OR
              ACCESSING THE DASHBOARD, YOU UNCONDITIONALLY ACCEPT AND AGREE TO
              BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE TO THESE TERMS, YOU
              ARE EXPRESSLY PROHIBITED FROM USING THE SERVICE.
            </p>
          </Panel>

          <TermSection title="1. License Grant and Restrictions">
            <p>
              Subject to your compliance with these Terms, we grant you a
              limited, non-exclusive, non-sublicensable, revocable,
              non-transferable license to access and use the Service solely
              for your personal, non-commercial entertainment purposes.
            </p>
            <h4 className="font-bold text-ink">Restrictions:</h4>
            <p>You agree that you will not:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Reverse engineer, decompile, disassemble, or attempt to
                derive the source code of the Service.
              </li>
              <li>
                Use the Service to transmit unauthorized communications,
                including &quot;spam&quot; or promotional materials.
              </li>
              <li>
                Interfere with or disrupt the integrity or performance of the
                Service or third-party data contained therein.
              </li>
              <li>
                Attempt to gain unauthorized access to the Service or its
                related systems or networks.
              </li>
            </ul>
          </TermSection>

          <TermSection title="2. Virtual Assets and Economy">
            <p>
              The Service simulates an economic system involving virtual
              currency, items, experience points, and other attributes
              (&quot;Virtual Assets&quot;).
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">No Ownership Rights:</strong> You
                acknowledge that you do not own the Virtual Assets. You
                possess a limited license to use them within the Service.
              </li>
              <li>
                <strong className="text-ink">No Real World Value:</strong>{" "}
                Virtual Assets have strictly no monetary value and cannot be
                exchanged for legal tender, real-world goods, or services.
              </li>
              <li>
                <strong className="text-ink">Right to Modify:</strong> We
                reserve the absolute right to manage, regulate, control,
                modify, or eliminate Virtual Assets at our sole discretion,
                with or without notice, and shall have no liability to you or
                any third party for the exercise of such rights.
              </li>
            </ul>
          </TermSection>

          <TermSection title="3. User Conduct and Prohibitions">
            <p>
              You agree not to engage in any of the following prohibited
              activities:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-ink">Exploitation:</strong>{" "}
                Identifying and utilizing bugs, glitches, or vulnerabilities
                to gain an unfair advantage (&quot;exploits&quot;). All bugs
                must be reported immediately.
              </li>
              <li>
                <strong className="text-ink">Automation:</strong> Using
                &quot;bots,&quot; &quot;macros,&quot; &quot;scripts,&quot; or
                other automated means to interact with the Service.
              </li>
              <li>
                <strong className="text-ink">Deceptive Practices:</strong>{" "}
                Engaging in scams, social engineering, or defrauding other
                users within the trading system.
              </li>
              <li>
                <strong className="text-ink">
                  Violation of Discord TOS:
                </strong>{" "}
                Using the Service in any manner that violates the Discord
                Terms of Service or Community Guidelines.
              </li>
            </ul>
            <p className="text-chip">
              Violation of these prohibitions may result in immediate
              termination of your license, account suspension, or a
              permanent ban from the Service without recourse.
            </p>
          </TermSection>

          <TermSection title="4. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless the Service
              Provider, its affiliates, officers, directors, employees,
              agents, and licensors from and against any and all claims,
              liabilities, damages, losses, costs, expenses, or fees
              (including reasonable attorneys&apos; fees) that such parties
              may incur as a result of or arising from your (or anyone using
              your account) violation of these Terms or your use of the
              Service.
            </p>
          </TermSection>

          <TermSection title="5. Disclaimer of Warranties">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              IMPORTANT
            </p>
            <p className="uppercase">
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER
              EXPRESS OR IMPLIED. WE EXPRESSLY DISCLAIM ANY AND ALL
              WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              NON-INFRINGEMENT, AND COURSE OF DEALING. WE DO NOT WARRANT THAT
              THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
            </p>
          </TermSection>

          <TermSection title="6. Limitation of Liability">
            <p className="uppercase">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
              SHALL THE SERVICE PROVIDER BE LIABLE FOR ANY INDIRECT,
              PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY
              DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF
              PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES,
              ARISING OUT OF OR RELATING TO THE USE OF, OR INABILITY TO USE,
              THE SERVICE.
            </p>
          </TermSection>

          <TermSection title="7. Governing Law and Dispute Resolution">
            <p>
              These Terms shall be governed by and construed in accordance
              with the laws of the United States of America, without regard
              to its conflict of law principles. Any dispute arising from or
              relating to the subject matter of these Terms shall be finally
              settled by arbitration or in a court of competent jurisdiction.
            </p>
          </TermSection>

          <TermSection title="8. Modifications">
            <p>
              We reserve the right to modify or replace these Terms at any
              time. If a revision is material, we will provide at least 30
              days&apos; notice prior to any new terms taking effect. What
              constitutes a material change will be determined at our sole
              discretion. By continuing to access or use our Service after
              those revisions become effective, you agree to be bound by the
              revised terms.
            </p>
            <a
              href="https://discord.gg/Y5P44UCH2Y"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium text-gold hover:text-gold-deep"
            >
              Join Support Server
            </a>
          </TermSection>
        </div>
      </div>

      <Footer />
    </main>
  );
}

function TermSection({
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
