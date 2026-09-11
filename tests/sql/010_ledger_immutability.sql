-- ===========================================================================
-- Invariant 2: a posted journal entry is immutable.
--
-- The system is worth nothing as a financial record if a row can be edited
-- after the fact. These tests attack the ledger directly, as a privileged
-- session, bypassing the posting engine entirely - because that is what an
-- attacker, a careless migration or a well-meaning hotfix would do.
-- ===========================================================================

do $$
declare
  v_suite text := 'ledger immutability';
  v_entry uuid;
  v_line  uuid;
begin
  v_entry := test.post_simple_entry('1015', '4010', 25000, 'Immutability fixture');
  select id into v_line from gl.journal_entry_line where entry_id = v_entry limit 1;

  perform test.throws(v_suite,
    'a posted entry cannot be updated',
    format('update gl.journal_entry set description = ''tampered'' where id = %L', v_entry),
    'append-only');

  perform test.throws(v_suite,
    'a posted entry cannot be deleted',
    format('delete from gl.journal_entry where id = %L', v_entry),
    'append-only');

  perform test.throws(v_suite,
    'a ledger line cannot be updated',
    format('update gl.journal_entry_line set debit_base = 1 where id = %L', v_line),
    'append-only');

  perform test.throws(v_suite,
    'a ledger line cannot be deleted',
    format('delete from gl.journal_entry_line where id = %L', v_line),
    'append-only');

  perform test.throws(v_suite,
    'the audit log cannot be rewritten',
    'update audit.log set actor_user_id = null where id = (select min(id) from audit.log)',
    'append-only');

  perform test.throws(v_suite,
    'the stock ledger cannot be deleted from',
    'delete from inv.stock_ledger where true',
    'append-only');

  -- Correction happens by reversal, and the original is left alone.
  declare
    v_reversal uuid;
    v_original_desc text;
  begin
    v_reversal := gl.reverse_entry(v_entry, 'Posted to the wrong account');

    select description into v_original_desc from gl.journal_entry where id = v_entry;

    perform test.ok(v_suite, 'reversing does not alter the original entry',
      v_original_desc = 'Immutability fixture', v_original_desc);

    perform test.eq(v_suite, 'the reversal points back at the original',
      (select reversal_of_entry_id from gl.journal_entry where id = v_reversal),
      v_entry);

    perform test.ok(v_suite, 'the original and its reversal net to zero',
      (select sum(debit_base - credit_base)
         from gl.journal_entry_line
        where entry_id in (v_entry, v_reversal)) = 0);

    perform test.ok(v_suite, 'the view reports the original as reversed',
      (select is_reversed from gl.v_journal_entry where id = v_entry));
  end;

  perform test.throws(v_suite,
    'an entry cannot be reversed twice',
    format('select gl.reverse_entry(%L, ''again'')', v_entry),
    'already been reversed');

  perform test.throws(v_suite,
    'a reversal cannot itself be reversed',
    format('select gl.reverse_entry((select id from gl.journal_entry where reversal_of_entry_id = %L), ''no'')', v_entry),
    'itself a reversal');
end;
$$;
