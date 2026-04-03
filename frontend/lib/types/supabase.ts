export type Database = {
  public: {
    Tables: {
      cases: {
        Row: {
          id: string;
          created_at: string;
          status: 'pending' | 'reviewing' | 'escalated' | 'resolved';
          risk_score: number;
          jurisdiction: string;
          assigned_authority: string | null;
          blockchain_tx_hash: string | null;
          ai_risk_breakdown: any | null;
        };
      };
      authorities: {
        Row: {
          id: string; // user id
          role: string;
          jurisdiction: string;
          name: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          created_at: string;
          case_id: string;
          authority_id: string;
          authority_name: string;
          action_type: string;
          tx_hash: string | null;
          verified_on_chain: boolean;
        };
      };
    };
  };
};
