import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

export default function Home(): ReactNode {
  return (
    <Layout
      title="Admin Guide"
      description="The practical field guide for running the Residio estate management dashboard.">
      <main className={styles.homepage}>
        <section className={styles.hero}>
          <div className="container">
            <p className={styles.eyebrow}>RESIDIO / ADMIN OPERATIONS</p>
            <Heading as="h1">Run the estate<br /><span>with confidence.</span></Heading>
            <p className={styles.lede}>A screenshot-led guide to the dashboard: people, property, money, security, and the daily decisions that keep an estate moving.</p>
            <div className={styles.buttons}>
              <Link className="button button--primary button--lg" to="/docs/getting-started/dashboard-overview">Open the guide</Link>
              <Link className="button button--secondary button--lg" to="/docs/finance/invoices-and-dues">Jump to finance</Link>
            </div>
          </div>
        </section>
        <section className={styles.routeGrid}>
          <div className="container">
            <p className={styles.sectionKicker}>WHAT YOU CAN DO HERE</p>
            <div className={styles.cards}>
              {[
                ['01', 'Know the day', 'Read the dashboard, spot exceptions, and move from signal to action.', '/docs/getting-started/dashboard-overview'],
                ['02', 'Keep records clean', 'Manage residents, houses, assignments, and the history behind them.', '/docs/residents/resident-directory'],
                ['03', 'Close the loop', 'Collect payments, approve work, protect the gate, and leave an audit trail.', '/docs/finance/invoices-and-dues'],
              ].map(([number, title, body, href]) => (
                <Link key={number} to={href} className={styles.card}>
                  <span className={styles.cardNumber}>{number}</span>
                  <Heading as="h2">{title}</Heading>
                  <p>{body}</p>
                  <span className={styles.cardArrow}>Read workflow <span aria-hidden="true">↗</span></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
