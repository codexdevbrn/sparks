# Sparks — painel de guild (MU Online)

Site interno da guild: filas de interesse nas peças de set, anúncios da liderança,
agenda de eventos com confirmação de presença e gestão de membros.

Stack: React 19 + TypeScript + Vite + Tailwind 4, Firebase (Auth Google + **Realtime
Database** + Hosting).

---

## Como funciona

**PWA.** O site é instalável como app (manifesto em `public/manifest.webmanifest`, service
worker em `public/sw.js`). O rodapé mostra um botão "Instalar app" onde o navegador
suporta o prompt nativo (`beforeinstallprompt`); onde não suporta (iOS Safari, notavelmente),
mostra a instrução de instalar manualmente pelo menu do navegador. O service worker não
faz precache — guarda em cache o que passa pela rede e serve isso offline, sem interferir
em nada do Firebase (só mexe em pedido same-origin).

**Feed principal.** A página inicial (`src/pages/Feed.tsx`) mistura anúncios, eventos e
enquetes num feed só, fixados primeiro e depois por data — em vez de três telas isoladas
que ninguém lembra de abrir. Cada card é o mesmo componente interativo das telas
dedicadas (RSVP no evento, voto na enquete), só reaproveitado; **Eventos** e **Enquetes**
continuam existindo à parte pra quem quer ver só aquilo.

**Anúncios com imagem.** O admin escreve o aviso e pode colar o link de uma print. Não há
upload: o Cloud Storage não está provisionado no projeto, e habilitá-lo em projeto novo
normalmente exige o plano Blaze. O campo guarda uma URL `https`, e o formulário mostra
pré-visualização ao vivo — se o link não servir uma imagem, quem publica descobre na hora,
e não a guild depois.

Links do **Google Drive** são convertidos automaticamente, porque o link de
compartilhamento aponta para uma página HTML e não para o arquivo. A conversão usa um
endereço não documentado pelo Google, que já mudou no passado e tem limite de tráfego em
arquivo público — o formulário avisa isso quando detecta um link do Drive. Para imagem que
precisa durar, prefira um host de imagem de verdade.

**Acesso.** Login com Google. Quem entra pela primeira vez vira `pending` e não vê nada
além da tela de espera. Um admin aprova em **Membros**. As regras do banco impedem que
alguém altere o próprio cargo.

**Listas por peça.** Várias pessoas podem querer a mesma peça (elmo, armadura, calça,
luvas, botas, arma, escudo). A ordem **não é de chegada**: a liderança decide, com setas
de subir/descer na página Sets, pelo critério da guild (quem joga mais). Esse critério
vive fora do sistema — o site só guarda a decisão.

O que o servidor garante é que a mesma pessoa não entre duas vezes na mesma fila: o
registro vive em `reservations/{setId}__{slot}__{uid}` e a regra de criação exige
`!data.exists()`. A chave também amarra o registro a uma peça e a uma pessoa, então não
dá para gravar em caminho arbitrário e furar a identidade.

**Quem mexe na ordem.** Só admin. A regra permite escrita em nó já existente apenas para
admin — se o membro pudesse, ele se colocaria em primeiro. Membro só cria a própria
entrada e sai da fila; admin também tira qualquer um.

**Entrega peça a peça.** Um set não sai de uma vez. Em **Escolhas**, o botão *Fazer
entrega* abre o pedido do player com todos os sets dele e o progresso de cada um
(`3/5 · completo`): as peças já entregues aparecem riscadas com a data, as que faltam
aparecem com botão de entregar. O admin vai marcando até fechar o set.

Cada entrega grava o registro e tira a peça da lista daquele player, numa escrita atômica.
Os outros interessados continuam na lista — a peça pode dropar de novo. Há também um
*entregou* direto na lista da peça, em Sets, para quando o contexto é a peça e não o
player.

A entrega **não é travada pela posição**: a posição aparece como contexto, mas o admin
entrega a quem decidir. Quem recebe primeiro é conversa da guild, não regra do sistema.

**Histórico.** A página **Histórico** é visível para toda a guild e mostra o ranking de
quem mais recebeu; a tela de Escolhas mostra o total recebido por player ao lado dos
pedidos. Lista é prioridade, histórico é fato — ter os dois à vista é o que permite
discutir a ordem sem depender de memória.

O log é append-only: admin registra e pode apagar um registro errado, mas ninguém edita.
Ele também sobrevive à exclusão do set e à remoção do membro — histórico que some deixa
de ser histórico.

**Eventos fixados e recorrentes.** Um evento pode ser fixado — fica sempre acima dos demais
na agenda — e pode se repetir toda semana no mesmo dia e horário, em vez de ter uma data
fixa. Não há Cloud Functions no projeto (só Hosting + RTDB + Auth), então a "próxima
ocorrência" de um evento recorrente não é gravada: é recalculada no navegador a partir do
dia da semana e do horário salvos, e nunca cai para "já aconteceu".

Confirmação de presença é opcional por evento — nem todo aviso precisa de RSVP. Em um
evento recorrente com confirmação ligada, a lista reseta sozinha **1h antes de cada
ocorrência**: as respostas vivem em `rsvpCycles/{eventId}/{cicloId}`, e o id do ciclo muda
exatamente nesse instante, então a troca de chave já é o reset — sem job, sem cron. Ciclos
antigos continuam no banco, só saem da tela.

**Online agora.** A página **Online** mostra quem da guild está logado no MuEliteWars
neste momento, com classe, level e o mapa + coordenada de cada um — pra saber com quem
contar pra uma corrida rápida sem precisar perguntar no chat. O navegador do jogador não
consegue buscar isso direto no site oficial (ele não libera CORS), então um robô externo
(GitHub Actions, ver `scripts/scrape-mu.mjs`) busca a página da guild em muelitewars.com a
cada 10 minutos e grava o resultado no banco; o app só lê, em tempo real. É opcional —
sem configurar o robô, a página mostra que ainda não há dados, e o resto do site funciona
normal. Setup em [Status ao vivo do MuEliteWars](#7-status-ao-vivo-do-muelitewars-opcional).

O próprio **Perfil** também mostra esse status, quando o nick do app bate com o nome do
personagem no jogo: classe, level, resets e onde o personagem está agora.

**Ranking de presença.** Além do ranking de quem mais recebeu (em Histórico), a mesma
página mostra quem mais confirma presença nos eventos — soma "vou" em eventos de data
fixa e em cada ciclo semanal de evento recorrente, então um Castle Siege confirmado toda
semana conta uma vez por semana. É o dado que embasa "quem realmente aparece", sem
depender de opinião.

**Mural.** Recado rápido e informal — "bora BC agora?" — sem a formalidade de um anúncio
(que continua só admin). Qualquer membro posta e apaga o próprio; admin apaga qualquer um.

**Enquetes.** O admin cria uma pergunta com opções, cada membro vota uma vez só (a regra
do banco recusa sobrescrever um voto já registrado), e o resultado aparece em barra de
porcentagem pra todo mundo — votado ou não.

**Bosses.** Catálogo à parte de Eventos — aqui o registro é o boss, não um evento único, e
cada um pode ter **vários horários de nascimento** (todo dia num horário, ou uma vez por
semana), local (mapa + coordenada) e observações (o que dropa etc.), tudo opcional exceto
o nome.

Cada horário roda como **cronômetro de verdade** (segundo a segundo, `HH:MM:SS`), porque o
horário é exato, não estimado. Quando o tempo até o próximo nascimento é curto o bastante
pra já ter passado — dentro de 15 minutos do horário calculado — o boss vira **🟢 Ativo**
(convenção da guild pra "provavelmente ainda tá lá"; não é uma confirmação de que alguém
viu o boss). O catálogo ordena ativos primeiro, depois por quem nasce mais cedo.

**Notificação do navegador** avisa 15min e 10min antes de cada nascimento, se a pessoa
autorizar (botão "🔔 Avisar 15min antes"). Só funciona com a aba aberta — sem servidor
mandando push de verdade, não dá pra avisar com o site fechado; é um alarme de aba aberta,
não notificação em segundo plano.

**Regras da guild.** Uma página só, mantida pelo admin — regras de drop, código de
conduta, o combinado. Não é uma lista de posts: é o documento de referência, pra não
depender de lembrar o que foi dito uma vez no Discord.

**Aviso no Discord (opcional).** Quando sai anúncio, evento novo ou uma entrega é
registrada, o site pode avisar automaticamente num canal do Discord via webhook — sem
precisar de servidor, o próprio navegador do admin manda o POST. Sem configurar
`VITE_DISCORD_WEBHOOK_URL`, essas ações funcionam normalmente e simplesmente não avisam
em lugar nenhum. Detalhe de segurança em `src/lib/discord.ts`: essa URL fica pública no
bundle do site, então o pior uso indevido possível é spam nesse canal — crie um webhook
dedicado só pra isso.

**Convite.** Em Membros, o admin tem um botão que copia o link do site — pra mandar pra
quem vai entrar. A aprovação continua manual (ver "Acesso" acima); isso só evita ter que
procurar a URL.

**Cadastro.** Tudo acontece na página **Sets**: o admin cadastra e todo mundo reserva, no
mesmo lugar. Os botões de cadastrar, editar e excluir só aparecem para admin. Não há
lista fixa no código, porque servidores privados customizam sets — cadastre o que existe
no seu servidor.

**Visão do admin.** A página **Escolhas** (só admin) lista cada player e o que ele pediu,
agrupado por set e com a posição dele em cada fila, e separa em destaque quem ainda não
escolheu nada — que é a informação acionável para cobrar o pessoal. Reordenar filas é na
página Sets, onde a fila inteira está visível.

**Dois formatos de cadastro.** Um registro pode ser:

- **Conjunto** — N peças (elmo, armadura, calça, luvas, botas, arma, escudo), cada uma
  reservável em separado.
- **Item único** — uma reserva só, para o que não é conjunto: arma, asa, jóia, pet.

O formato não é um campo no banco: é derivado da composição de peças, em que
`slots: { item: true }` significa "coisa só". Por isso as regras de segurança não
precisaram mudar para suportar itens.

---

## Setup

### 1. Projeto no Firebase

No [console do Firebase](https://console.firebase.google.com):

1. Crie um projeto.
2. **Authentication** → Começar → habilite o provedor **Google**.
3. **Realtime Database** → Criar banco → modo **bloqueado** (as regras deste repo cuidam do acesso).
4. **Configurações do projeto** → Seus apps → adicione um app **Web** e copie o objeto de configuração.

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha com os valores do passo anterior. O `databaseURL` é obrigatório — é o endereço
do Realtime Database (algo como `https://<projeto>-default-rtdb.firebaseio.com`).

Essas chaves são públicas por natureza: elas vão no bundle do navegador. A segurança dos
dados vem de `database.rules.json`.

### 3. Rodar local

```bash
npm install
npm run dev
```

### 4. Publicar as regras

O `firebase-tools` já é dependência de desenvolvimento do projeto — não precisa instalar
nada global. O projeto alvo está fixado em `.firebaserc`.

```bash
npm run fb:login      # abre o navegador, uma vez por máquina
npm run deploy:rules
```

Sem este passo o app abre mas toda leitura falha com `permission_denied`.

### 5. Virar o primeiro admin

Ovo e galinha: só um admin promove alguém, e ainda não existe admin. Faça manualmente,
uma única vez:

1. Faça login no site — seu nó é criado em `members/{seu-uid}`.
2. No console do Firebase → Realtime Database → nó `members` → seu uid.
3. Troque o campo `role` de `pending` para `admin`.

A tela libera na hora, sem recarregar (a escuta é em tempo real). Daí em diante você
aprova e promove todo mundo pela interface.

### 6. Deploy

```bash
npm run deploy
```

Depois adicione o domínio do Hosting em **Authentication → Settings → Domínios
autorizados**, senão o login com Google é bloqueado em produção.

### 7. Status ao vivo do MuEliteWars (opcional)

O robô que preenche a página **Online** roda no GitHub Actions do próprio repositório,
não em algum servidor à parte. Ele precisa de uma credencial de admin do Firebase (que
ignora as regras do banco, porque quem escreve ali não é um membro logado) guardada como
secret do repositório:

1. **Console do Firebase** → ⚙️ **Configurações do projeto** → **Contas de serviço** →
   **Gerar nova chave privada**. Baixa um `.json` — guarde-o, ele dá acesso total ao
   projeto, não é algo pra commitar ou compartilhar.
2. No GitHub, **Settings → Secrets and variables → Actions → New repository secret**:
   - Nome: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: o conteúdo inteiro do `.json` baixado.
3. Pronto — o workflow `.github/workflows/scrape-mu.yml` já roda a cada 10 minutos.
   Pra forçar uma rodada sem esperar, **Actions → Scrape status MuEliteWars → Run
   workflow**.

Por padrão ele busca a guild `Sparks`; se o nome for outro, mude `MU_GUILD_NAME` no
workflow. Pra rodar na sua máquina em vez do Actions: `npm run scrape:mu`, com
`FIREBASE_SERVICE_ACCOUNT` (o mesmo JSON, numa variável de ambiente) e opcionalmente
`FIREBASE_DATABASE_URL` no ambiente.

---

## Estrutura de dados

O Realtime Database é uma árvore JSON única. Os nós são mantidos rasos de propósito:
ler um nó traz toda a subárvore, então nada que cresce sem limite fica pendurado dentro
de outra coisa.

```
members/{uid}                     perfil + role: pending | member | admin
sets/{setId}                      nome, classe, tier, slots: { helm: true, ... }
                                  slots: { item: true } => item unico
reservations/{setId}__{slot}__{uid}
                                  interesse de uma pessoa numa peca,
                                  com `order` definindo a posicao na fila
drops/{pushId}                    entrega registrada: quem recebeu o que e quando
                                  (chave por push: a mesma peca pode dropar de novo)
announcements/{id}                título, texto, pinned
events/{id}                       título, tipo, startsAt (ms) OU recurrence
                                  { weekday, hour, minute }, pinned, rsvpEnabled
rsvps/{eventId}/{uid}             presença em evento de data fixa: going | maybe | out
rsvpCycles/{eventId}/{cicloId}/{uid}
                                  presença em evento recorrente; cicloId muda
                                  sozinho 1h antes de cada ocorrência
muStatus                          updatedAt, guild, online, total,
                                  chars/{nome}: classe, level, resets, online,
                                  map, x, y, uid (casado por nick)
bosses/{id}                       nome, notes (opcional),
                                  schedules: [{ weekday?, hour, minute }, ...]
guildRules                        body, updatedBy, updatedAt -- um no so
polls/{id}                        question, options: [...], closesAt
pollVotes/{pollId}/{uid}          optionIndex -- um voto so, nao sobrescreve
shouts/{id}                       uid, nick, text, createdAt
```

| Nó | Quem escreve |
| --- | --- |
| `members/{uid}` | o próprio (só o perfil, nunca o cargo) e admin |
| `sets` | admin |
| `reservations` | membro entra na própria fila e sai dela; só admin muda `order` ou tira outra pessoa |
| `drops` | só admin cria e apaga; ninguém edita (append-only). Toda a guild lê |
| `announcements` | admin |
| `events` | admin |
| `rsvps/{eventId}/{uid}` | o próprio membro |
| `rsvpCycles/{eventId}/{cicloId}/{uid}` | o próprio membro |
| `muStatus` | ninguém pelo cliente — só o robô do GitHub Actions, com credencial de admin que ignora as regras |
| `bosses` | admin |
| `guildRules` | admin |
| `polls` | admin |
| `pollVotes/{pollId}/{uid}` | o próprio membro, uma vez só (não sobrescreve) |
| `shouts` | qualquer membro cria e apaga o próprio; admin apaga qualquer um |

As presenças ficam em `rsvps/`, e não dentro de `events/`, justamente para que carregar
a agenda não baixe a confirmação de todo mundo.

Excluir um set apaga as filas dele, e remover um membro tira a pessoa de todas as filas —
ambos via escrita multi-path, que é atômica. Remover apenas uma peça da composição de um
set não apaga a fila dela: ela fica invisível e volta a aparecer se a peça for reativada.

Reordenar uma fila **troca o `order` entre dois vizinhos**, não renumera a fila inteira.
Duas reordenações simultâneas em pontos diferentes da mesma fila não se atropelam, e o
`order` nasce como `Date.now()` — o que já dá a ordem de chegada como proposta inicial.

---

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run typecheck` | checagem de tipos |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm run fb:login` | autentica o Firebase CLI (uma vez por máquina) |
| `npm run deploy:rules` | publica só `database.rules.json` |
| `npm run deploy` | build + publica regras e site |
| `npm run scrape:mu` | roda o robô de status do MuEliteWars localmente (ver setup [passo 7](#7-status-ao-vivo-do-muelitewars-opcional)) |

---

## Limitações conhecidas

- **Ordenação e filtro acontecem no cliente.** O Realtime Database só ordena por um campo
  por consulta, então o app baixa cada nó inteiro (`sets`, `members`, `reservations`,
  `announcements`, `events`) e ordena em memória. Para dezenas ou poucas centenas de
  registros isso é irrelevante; passando de alguns milhares, o caminho é paginar com
  `orderByChild` + `limitToLast`, ou voltar para o Firestore.
- **As regras repetem a checagem de cargo** em cada nó, porque a linguagem de regras do
  RTDB não tem funções. Mexer em uma exige mexer em todas.
- **O histórico depende de alguém registrar.** Se o admin esquecer de clicar em
  *entregou*, o drop não existe para o sistema. Não há como o site saber o que aconteceu
  no jogo.
- **Fuso horário dos eventos** é o do navegador de quem cadastra e de quem lê. Para uma
  guild toda no mesmo fuso não é problema; para guild internacional, precisa guardar o
  fuso explicitamente.
- **Sem emulador no fluxo padrão.** `firebase.json` já tem as portas; para usar, aponte o
  SDK para os emuladores em `src/lib/firebase.ts`.
- **O status do MuEliteWars depende do layout do site deles não mudar.** O scraper lê a
  tabela de perfil por regex, não por API — não existe uma. Se o site mudar o HTML, o job
  do GitHub Actions passa a falhar (aparece vermelho em **Actions**) até alguém ajustar
  `scripts/scrape-mu.mjs`; a página **Online** simplesmente para de atualizar, não quebra.
  O intervalo de 10 minutos também é de propósito: mais frequente que isso pesa no
  servidor deles sem necessidade real.
