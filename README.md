# ULTRA PHONE ERP — primeira etapa

Base do ERP solicitada para a ULTRA PHONE, seguindo a referência azul cromada e preta enviada pela usuária.

## O que está implementado no código

- Dashboard sem números fictícios, com vendas, estoque, contas pendentes e movimentos.
- Autenticação por e-mail e senha usando Supabase Auth.
- Lojas separadas e acesso por associação do usuário.
- Clientes de pessoa física, CPF opcional validado, edição e desativação preservando histórico.
- Entrada individual de aparelhos por IMEI válido: condição, bateria, procedência, nota de origem, inspeção, garantia contratual e custos.
- Compra paga ou pendente, com lançamento financeiro somente quando paga.
- Venda de vários aparelhos, desconto, entrada, parcelas e vencimentos ajustados para fim do mês.
- Recebimento parcial de parcelas, sem permitir valores superiores ao saldo.
- Cancelamento com reposição de estoque e estorno contábil dos recebimentos. A devolução efetiva de dinheiro é manual e precisa ser confirmada pelo operador.
- Consulta de IMEI no cadastro e histórico internos, sem afirmar originalidade ou situação externa.
- Pré-visualização de impressão pelo navegador de comprovante não fiscal, parcelas e espaço para assinatura.
- Relatórios básicos e exportação CSV.
- Registro de auditoria no banco, protegido contra alterações por usuários do aplicativo.
- Modos claro/escuro e interface responsiva.

- Impressão de notas promissórias por parcela em aberto, com valor, vencimento, emitente, beneficiário e espaço para assinatura; exige conferência/preenchimento antes de assinatura e orientação jurídica para utilização.

## Estado da entrega

O código compila e as regras de banco foram testadas em PostgreSQL local via PGlite. O projeto Supabase da usuária ainda precisa ser criado, o esquema aplicado e um primeiro usuário configurado. Antes disso, a interface bloqueia gravações. Nenhum dado comercial fica em localStorage. A sessão de autenticação é gerida pelo SDK Supabase.

Não foi realizado teste de navegador neste ambiente: o controle de navegador requerido pelo fluxo Sites não estava disponível. Não foram realizados testes no Supabase remoto nem testes de concorrência com múltiplas conexões reais. A primeira etapa deve ser validada no ambiente conectado antes do uso comercial. Nenhuma versão foi publicada em produção, conforme a especificação enviada.

## Configurar

1. Escolher a organização Supabase e verificar/confirmar o custo de criação do projeto.
2. Criar projeto dedicado `ultra-phone-erp`, preferencialmente na região de São Paulo.
3. Revisar `database/schema.sql`, gerar a migration com o CLI (`supabase migration new ultra_phone_core`) e aplicar ao projeto escolhido. O SQL ainda é uma proposta versionável, não uma migration aplicada.
4. Configurar no ambiente do servidor:
   - `SUPABASE_URL`: URL HTTPS do projeto.
   - `SUPABASE_PUBLISHABLE_KEY`: chave pública moderna `sb_publishable_...`.
   Nunca colocar chave secreta ou service_role nesses campos. `/api/config` expõe apenas a chave pública, cuja utilização depende das políticas RLS.
5. Criar o primeiro usuário administrador no Supabase Auth. Configurar endereço do site e SMTP próprio antes de disponibilizar fluxos de cadastro ou recuperação de senha. O aplicativo desta etapa disponibiliza somente login de contas já criadas.
6. Entrar na interface e clicar em **Criar loja**. O usuário criador recebe associação administrativa.
7. Fazer a validação abaixo antes de publicar para uso real.

## Desenvolvimento

Ambiente de Node 22.13 ou superior. O projeto usa React, TypeScript, componentes shadcn, Tailwind e Supabase; o runtime fornecido por Sites é Vinext, compatível com o App Router. Não foi criado um deployment Vercel nesta entrega.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm dev
pnpm build
```

Com Sites, usar os helpers fornecidos para build, sincronização e publicação. Uma implantação Vercel/Next.js exigirá revisão de configuração e remoção das dependências específicas do runtime Sites; não afirmar compatibilidade Vercel já validada.

## Verificar antes da operação real

- Aplicar schema, conferir grants e políticas RLS e rodar advisors do Supabase.
- Criar loja e usuário. Verificar autenticação, troca de loja e logout.
- Cadastrar cliente e aparelho real de teste.
- Validar compra pendente e paga.
- Registrar venda sem entrada e garantir que nada apareça recebido.
- Receber parcialmente, conferir saldo e tentar excedê-lo.
- Testar cancelamento após recebimento e conferir estorno, parcelas e estoque.
- Testar venda simultânea do mesmo aparelho com duas sessões.
- Testar usuários de outra loja e os papéis vendedor, financeiro e técnico.
- Conferir impressão A4 e interface em celular.

## Próximas etapas (ainda não implementadas)

Pessoa jurídica/CNPJ, fotos e documentos protegidos em Storage, perfis e permissões administráveis, fornecedores completos, orçamento/reserva, troca com torna, caixa por operador, despesas/taxas/comissões, juros e renegociação, carnê/promissórias/contrato com aceite, assinatura eletrônica, garantia legal e devolução parcial, ordens de serviço e peças, boletos bancários, pagamento Pix/cartão via provedor, WhatsApp/e-mail automáticos, API externa de IMEI, emissão fiscal NF-e/NFC-e/NFS-e, filtros avançados, relatórios PDF/Excel e backups operacionais.

A emissão de comprovante pelo navegador não equivale a nota fiscal autorizada. Nenhum serviço fiscal, bancário ou de IMEI externo está simulado.
