[
  {
    "oid": 20852,
    "polname": "Allow authenticated users to create accounts",
    "polrelid": 19740,
    "polcmd": "a",
    "polpermissive": true,
    "polroles": [
      16481
    ],
    "polqual": null,
    "polwithcheck": "{CONST :consttype 16 :consttypmod -1 :constcollid 0 :constlen 1 :constbyval true :constisnull false :location -1 :constvalue 1 [ 1 0 0 0 0 0 0 0 ]}"
  },
  {
    "oid": 20853,
    "polname": "Allow authenticated users to view their associated accounts",
    "polrelid": 19740,
    "polcmd": "r",
    "polpermissive": true,
    "polroles": [
      16481
    ],
    "polqual": "{SUBLINK :subLinkType 0 :subLinkId 0 :testexpr <> :operName <> :subselect {QUERY :commandType 1 :querySource 0 :canSetTag true :utilityStmt <> :resultRelation 0 :hasAggs false :hasWindowFuncs false :hasTargetSRFs false :hasSubLinks false :hasDistinctOn false :hasRecursive false :hasModifyingCTE false :hasForUpdate false :hasRowSecurity false :isReturn false :cteList <> :rtable ({RANGETBLENTRY :alias <> :eref {ALIAS :aliasname account_users :colnames (\"id\" \"account_id\" \"user_id\" \"role\" \"invited_by\" \"invited_at\" \"joined_at\" \"is_active\")} :rtekind 0 :relid 19767 :inh true :relkind r :rellockmode 1 :perminfoindex 1 :tablesample <> :lateral false :inFromCl true :securityQuals <>}) :rteperminfos ({RTEPERMISSIONINFO :relid 19767 :inh true :requiredPerms 2 :checkAsUser 0 :selectedCols (b 9 10) :insertedCols (b) :updatedCols (b)}) :jointree {FROMEXPR :fromlist ({RANGETBLREF :rtindex 1}) :quals {BOOLEXPR :boolop and :args ({OPEXPR :opno 2972 :opfuncid 2956 :opresulttype 16 :opretset false :opcollid 0 :inputcollid 0 :args ({VAR :varno 1 :varattno 2 :vartype 2950 :vartypmod -1 :varcollid 0 :varnullingrels (b) :varlevelsup 0 :varnosyn 1 :varattnosyn 2 :location -1} {VAR :varno 1 :varattno 1 :vartype 2950 :vartypmod -1 :varcollid 0 :varnullingrels (b) :varlevelsup 1 :varnosyn 1 :varattnosyn 1 :location -1}) :location -1} {OPEXPR :opno 2972 :opfuncid 2956 :opresulttype 16 :opretset false :opcollid 0 :inputcollid 0 :args ({VAR :varno 1 :varattno 3 :vartype 2950 :vartypmod -1 :varcollid 0 :varnullingrels (b) :varlevelsup 0 :varnosyn 1 :varattnosyn 3 :location -1} {FUNCEXPR :funcid 16538 :funcresulttype 2950 :funcretset false :funcvariadic false :funcformat 0 :funccollid 0 :inputcollid 0 :args <> :location -1}) :location -1}) :location -1}} :mergeActionList <> :mergeTargetRelation 0 :mergeJoinCondition <> :targetList ({TARGETENTRY :expr {CONST :consttype 23 :consttypmod -1 :constcollid 0 :constlen 4 :constbyval true :constisnull false :location -1 :constvalue 4 [ 1 0 0 0 0 0 0 0 ]} :resno 1 :resname ?column? :ressortgroupref 0 :resorigtbl 0 :resorigcol 0 :resjunk false}) :override 0 :onConflict <> :returningList <> :groupClause <> :groupDistinct false :groupingSets <> :havingQual <> :windowClause <> :distinctClause <> :sortClause <> :limitOffset <> :limitCount <> :limitOption 0 :rowMarks <> :setOperations <> :constraintDeps <> :withCheckOptions <> :stmt_location -1 :stmt_len -1} :location -1}",
    "polwithcheck": null
  },
  {
    "oid": 20854,
    "polname": "Allow account admins to update accounts",
    "polrelid": 19740,
    "polcmd": "w",
    "polpermissive": true,
    "polroles": [
      16481
    ],
    "polqual": "{FUNCEXPR :funcid 20182 :funcresulttype 16 :funcretset false :funcvariadic false :funcformat 0 :funccollid 0 :inputcollid 0 :args ({VAR :varno 1 :varattno 1 :vartype 2950 :vartypmod -1 :varcollid 0 :varnullingrels (b) :varlevelsup 0 :varnosyn 1 :varattnosyn 1 :location -1}) :location -1}",
    "polwithcheck": "{FUNCEXPR :funcid 20182 :funcresulttype 16 :funcretset false :funcvariadic false :funcformat 0 :funccollid 0 :inputcollid 0 :args ({VAR :varno 1 :varattno 1 :vartype 2950 :vartypmod -1 :varcollid 0 :varnullingrels (b) :varlevelsup 0 :varnosyn 1 :varattnosyn 1 :location -1}) :location -1}"
  },
  {
    "oid": 20855,
    "polname": "Allow account admins to delete accounts",
    "polrelid": 19740,
    "polcmd": "d",
    "polpermissive": true,
    "polroles": [
      16481
    ],
    "polqual": "{FUNCEXPR :funcid 20182 :funcresulttype 16 :funcretset false :funcvariadic false :funcformat 0 :funccollid 0 :inputcollid 0 :args ({VAR :varno 1 :varattno 1 :vartype 2950 :vartypmod -1 :varcollid 0 :varnullingrels (b) :varlevelsup 0 :varnosyn 1 :varattnosyn 1 :location -1}) :location -1}",
    "polwithcheck": null
  }
]