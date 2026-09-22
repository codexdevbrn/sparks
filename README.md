# Sparks — painel de guild (MU Online)

Site interno da guild: filas de interesse nas peças de set, anúncios da liderança,
agenda de eventos com confirmação de presença e gestão de membros.

Stack: React 19 + TypeScript + Vite + Tailwind 4, Firebase (Auth Google + **Realtime
Database** + Hosting).

---

## Como funciona

**Acesso.** Login com Google. Quem entra pela primeira vez vira `pending` e não vê nada
além da tela de espera. Um admin aprova em **Membros**. As regras do banco impedem que
alguém altere o próprio cargo.

**Filas por peça.** Várias pessoas podem querer a mesma peça (elmo, armadura, calça,
luvas, botas, arma, escudo): elas formam uma fila. A ordem não é automática — **a
liderança decide**, com setas de subir/descer na página Sets, segundo o critério da guild
(quem joga mais).

O que o servidor garante é que a mesma pessoa não entre duas vezes na mesma fila: o
registro vive em `reservations/{setId}__{slot}__{uid}` e a regra de criação exige
`!data.exists()`. A chave também amarra o registro a uma peça e a uma pessoa, então não
dá para gravar em caminho arbitrário e furar a identidade.

**Quem mexe na ordem.** Só admin. A regra permite escrita em nó já existente apenas para
admin — se o membro pudesse, ele se colocaria em primeiro. Membro só cria a própria
entrada e sai da fila; admin também tira qualquer um.

**Cadastro.** Tudo acontece na página **Sets**: o admin cadastra e todo mundo reserva, no
mesmo lugar. Os botões de cadastrar, editar e excluir só aparecem para admin. Não há
lista fixa no código, porque servidores privados customizam sets — existe um seed com os
sets clássicos mais comuns como ponto de partida, que deve ser revisado antes de usar.

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
announcements/{id}                título, texto, pinned
events/{id}                       título, tipo, startsAt (ms)
rsvps/{eventId}/{uid}             going | maybe | out
```

| Nó | Quem escreve |
| --- | --- |
| `members/{uid}` | o próprio (só o perfil, nunca o cargo) e admin |
| `sets` | admin |
| `reservations` | membro entra na própria fila e sai dela; só admin muda `order` ou tira outra pessoa |
| `announcements` | admin |
| `events` | admin |
| `rsvps/{eventId}/{uid}` | o próprio membro |

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

---

## Limitações conhecidas

- **Ordenação e filtro acontecem no cliente.** O Realtime Database só ordena por um campo
  por consulta, então o app baixa cada nó inteiro (`sets`, `members`, `reservations`,
  `announcements`, `events`) e ordena em memória. Para dezenas ou poucas centenas de
  registros isso é irrelevante; passando de alguns milhares, o caminho é paginar com
  `orderByChild` + `limitToLast`, ou voltar para o Firestore.
- **As regras repetem a checagem de cargo** em cada nó, porque a linguagem de regras do
  RTDB não tem funções. Mexer em uma exige mexer em todas.
- **Sem histórico.** Sair de uma fila apaga o registro, e nada registra quem levou o
  drop de fato — a fila diz quem tem prioridade, não quem recebeu. Se a guild precisar
  auditar quem ficou com o quê, o modelo precisa de um nó de log.
- **Fuso horário dos eventos** é o do navegador de quem cadastra e de quem lê. Para uma
  guild toda no mesmo fuso não é problema; para guild internacional, precisa guardar o
  fuso explicitamente.
- **Sem emulador no fluxo padrão.** `firebase.json` já tem as portas; para usar, aponte o
  SDK para os emuladores em `src/lib/firebase.ts`.
